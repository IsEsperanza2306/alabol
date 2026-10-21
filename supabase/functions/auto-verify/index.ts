// AUTO-VERIFY — Motor de verificación automática (migrada de Netlify). Requiere verificador o admin.
// deno-lint-ignore-file no-explicit-any no-var
import { json, preflight, rolDe, sbSelect, sbPatch, sbDownload, limpiarFolio, toBase64, MODELO_CLAUDE } from '../_shared/comun.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const NHTSA_API = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  const rol = await rolDe(req);
  if (!rol.verificador) return json(req, 401, { error: 'No autorizado' });
  try {
    const body = await req.json().catch(() => ({}));
    const folio = limpiarFolio(body.folio, 12);
    if (!folio) return json(req, 400, { error: 'Folio requerido' });
    const rows = await sbSelect('verificaciones', 'folio=eq.' + encodeURIComponent(folio) + '&limit=1');
    if (!rows.length) return json(req, 404, { error: 'No encontrado' });
    const exp = rows[0];
    const results: any = { checks: {}, semaforo: {}, score: 0, maxScore: 12, timestamp: new Date().toISOString() };

    const checksumResult: any = vinChecksum(exp.vin);
    results.checks.vin_checksum = checksumResult;
    results.semaforo.vin_valido = checksumResult.valid ? 'verde' : checksumResult.skipped ? 'amarillo' : 'rojo';

    const c1 = new AbortController(); const t1 = setTimeout(() => c1.abort(), 6000);
    const c2 = new AbortController(); const t2 = setTimeout(() => c2.abort(), 8000);
    const par = await Promise.allSettled([decodeNhtsa(exp.vin, c1.signal), checkRepuve(exp.vin, c2.signal)]);
    clearTimeout(t1); clearTimeout(t2);
    const nhtsaResult: any = par[0].status === 'fulfilled' ? par[0].value : { success: false, error: 'Timeout' };
    const repuveResult: any = par[1].status === 'fulfilled' ? par[1].value : { status: 'pendiente', message: 'Timeout' };

    results.checks.nhtsa = nhtsaResult;
    if (nhtsaResult.success) {
      const crossRef = crossReference(exp, nhtsaResult.data);
      results.checks.cross_reference = crossRef;
      results.semaforo.vin_no_remarcado = crossRef.match ? 'verde' : 'rojo';
    } else results.semaforo.vin_no_remarcado = 'amarillo';

    results.checks.repuve = repuveResult;
    results.semaforo.sin_reporte_robo = repuveResult.status === 'reporte' ? 'rojo' : 'amarillo';
    results.checks.country = detectCountry(exp.vin);

    const fotos = exp.fotos || {};
    results.semaforo.documentos_completos = (fotos.tarjeta_circulacion && fotos.factura) ? 'verde' : 'rojo';
    results.semaforo.tarjeta_circulacion = fotos.tarjeta_circulacion ? 'verde' : 'rojo';
    results.semaforo.factura_original = fotos.factura ? 'verde' : 'amarillo';
    results.semaforo.chip_repuve = fotos.chip_repuve ? 'amarillo' : 'rojo';
    results.semaforo.numero_motor = fotos.numero_motor ? 'amarillo' : 'rojo';

    if (ANTHROPIC_API_KEY && Object.keys(fotos).length > 0) {
      try {
        const ai: any = await analyzePhotosWithAI(fotos, exp.vin, exp.marca, exp.modelo);
        results.checks.ai_analysis = ai;
        if (ai.success && ai.semaforo) Object.keys(ai.semaforo).forEach((k) => {
          if (results.semaforo[k] === 'amarillo' || !results.semaforo[k]) results.semaforo[k] = ai.semaforo[k];
        });
      } catch (e) { results.checks.ai_analysis = { success: false, error: (e as Error).message }; }
    }
    ['condicion_exterior', 'pintura_original', 'estructura_integra', 'placas_vigentes'].forEach((k) => { if (!results.semaforo[k]) results.semaforo[k] = 'amarillo'; });
    const scoreMap: any = { verde: 1, amarillo: 0.5, rojo: 0 };
    Object.values(results.semaforo).forEach((v: any) => { results.score += (scoreMap[v] || 0); });

    await sbPatch('verificaciones', 'folio=eq.' + encodeURIComponent(folio), {
      resultados_automaticos: results, semaforo: results.semaforo,
      nhtsa_data: nhtsaResult.success ? nhtsaResult.data : (exp.nhtsa_data || {}),
      repuve_status: repuveResult.status, vin_checksum_valido: checksumResult.valid, estatus: 'en_revision',
    });
    return json(req, 200, { folio, score: results.score + '/' + results.maxScore, semaforo: results.semaforo, checks: Object.keys(results.checks).length, message: 'Verificacion automatica completada' });
  } catch (err) {
    return json(req, 500, { error: (err as Error).message || 'Error interno' });
  }
});

// ── VIN CHECKSUM ──
function vinChecksum(vin: any): any {
  if (!vin || vin.length !== 17) return { valid: false, error: 'VIN invalido' };
  vin = vin.toUpperCase();
  // Skip checksum for non-North American VINs
  var firstChar = vin[0];
  if (!('12345'.indexOf(firstChar) !== -1 || firstChar === '3')) {
    return { valid: true, skipped: true, note: 'Checksum no aplica para VINs fuera de Norteamerica' };
  }
  var trans: any = {A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9};
  var weights = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
  var sum = 0;
  for (var i = 0; i < 17; i++) {
    var c = vin[i];
    var val = trans[c] !== undefined ? trans[c] : parseInt(c, 10);
    if (isNaN(val)) return { valid: false, error: 'Caracter invalido: ' + c };
    sum += val * weights[i];
  }
  var expected = sum % 11;
  var expectedChar = expected === 10 ? 'X' : String(expected);
  return { valid: vin[8] === expectedChar, checkDigit: expectedChar };
}

// ── NHTSA DECODE ──
async function decodeNhtsa(vin: any, signal: AbortSignal): Promise<any> {
  var res = await fetch(NHTSA_API + '/' + vin + '?format=json', { signal: signal });
  if (!res.ok) throw new Error('NHTSA status ' + res.status);
  var json = await res.json();
  var r = json.Results && json.Results[0];
  if (!r) return { success: false, error: 'Sin resultados' };
  var codes = (r.ErrorCode || '0').split(',').map(function (s: string) { return s.trim(); });
  if (codes.indexOf('0') === -1) return { success: false, error: r.ErrorText };
  return {
    success: true,
    data: { make: r.Make || '', model: r.Model || '', year: parseInt(r.ModelYear, 10) || null, bodyClass: r.BodyClass || '', fuelType: r.FuelTypePrimary || '', manufacturer: r.Manufacturer || '', plantCountry: r.PlantCountry || '', engineCylinders: r.EngineCylinders || '', engineDisplacement: r.DisplacementL || '' }
  };
}

// ── CROSS-REFERENCE ──
function crossReference(exp: any, nhtsa: any) {
  var disc: string[] = [];
  var dm = (exp.marca || '').toUpperCase(), nm = (nhtsa.make || '').toUpperCase();
  if (dm && nm && nm.indexOf(dm) === -1 && dm.indexOf(nm) === -1) disc.push('Marca: ' + exp.marca + ' vs ' + nhtsa.make);
  var dmo = (exp.modelo || '').toUpperCase(), nmo = (nhtsa.model || '').toUpperCase();
  if (dmo && nmo && nmo.indexOf(dmo) === -1 && dmo.indexOf(nmo) === -1) disc.push('Modelo: ' + exp.modelo + ' vs ' + nhtsa.model);
  if (exp.anio && nhtsa.year && exp.anio !== nhtsa.year) disc.push('Ano: ' + exp.anio + ' vs ' + nhtsa.year);
  return { match: disc.length === 0, discrepancies: disc };
}

// ── REPUVE ──
async function checkRepuve(vin: any, signal: AbortSignal): Promise<any> {
  try {
    var res = await fetch('https://www2.repuve.gob.mx:8443/ciudadania/consulta', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'niv=' + encodeURIComponent(vin), signal: signal
    });
    if (!res.ok) throw new Error('REPUVE status ' + res.status);
    var html = await res.text();
    if (html.indexOf('ROBO') !== -1 || html.indexOf('robo') !== -1 || html.indexOf('REPORTE') !== -1) return { status: 'reporte', message: 'ALERTA: Vehiculo con reporte activo en REPUVE' };
    if (html.indexOf('INSCRITO') !== -1 || html.indexOf('inscrito') !== -1) return { status: 'consulta_ok', message: 'REPUVE respondio — requiere confirmacion del verificador' };
    if (html.indexOf('NO SE ENCONTR') !== -1) return { status: 'no_encontrado', message: 'VIN no encontrado en REPUVE' };
    return { status: 'pendiente', message: 'Respuesta REPUVE no interpretable' };
  } catch (err) {
    return { status: 'pendiente', message: 'REPUVE no disponible: ' + (err as Error).message };
  }
}

// ── PAÍS ──
function detectCountry(vin: any) {
  if (!vin || vin.length < 2) return 'Desconocido';
  var wmi = vin.substring(0, 2).toUpperCase();
  if (wmi[0] === '3') return 'Mexico';
  var map: any = { '1': 'USA', '4': 'USA', '5': 'USA', '2': 'Canada', 'J': 'Japon', 'K': 'Corea', 'L': 'China', 'W': 'Alemania', 'Z': 'Italia', 'S': 'UK' };
  return map[wmi] || map[wmi[0]] || 'Otro';
}

// ── CLAUDE VISION ──
async function analyzePhotosWithAI(fotos: any, vin: any, marca: any, modelo: any): Promise<any> {
  if (!ANTHROPIC_API_KEY) return { success: false, error: 'API key no configurada' };
  var photoKeys = ['niv_tablero', 'niv_chasis', 'numero_motor', 'chip_repuve', 'tarjeta_circulacion', 'factura'];
  var content: any[] = [];
  for (var k = 0; k < photoKeys.length; k++) {
    var key = photoKeys[k];
    if (!fotos[key]) continue;
    var imgData = await sbDownload('verificaciones', fotos[key]);
    if (!imgData) continue;
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: toBase64(imgData) } });
    content.push({ type: 'text', text: 'Foto: ' + key });
  }
  if (content.length === 0) return { success: false, error: 'No se pudieron descargar fotos' };

  content.push({ type: 'text', text: 'Eres un verificador vehicular experto en Mexico. Analiza estas fotos.\nDATOS DECLARADOS: VIN: ' + esc(vin) + ' | Marca: ' + esc(marca) + ' | Modelo: ' + esc(modelo) + '\nRESPONDE EN JSON (sin markdown):\n{"vin_legible":true/false,"vin_leido":"string o null","vin_coincide":true/false,"indicios_remarcado":true/false,"remarcado_detalle":"string o null","chip_repuve_legible":true/false,"tarjeta_legible":true/false,"factura_legible":true/false,"motor_numero_legible":true/false,"alertas":[],"confianza_general":"alta/media/baja"}' });

  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODELO_CLAUDE, max_tokens: 1024, messages: [{ role: 'user', content: content }] })
  });
  if (!res.ok) throw new Error('Claude API ' + res.status);
  var result = await res.json();
  var txt = result.content && result.content[0] && result.content[0].text;
  if (!txt) throw new Error('Respuesta vacia');
  var analysis = JSON.parse(txt.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  var sem: any = {};
  if (analysis.vin_coincide === true && !analysis.indicios_remarcado) sem.vin_no_remarcado = 'verde';
  else if (analysis.indicios_remarcado) sem.vin_no_remarcado = 'rojo';
  if (analysis.chip_repuve_legible) sem.chip_repuve = 'verde';
  if (analysis.tarjeta_legible) sem.tarjeta_circulacion = 'verde';
  if (analysis.factura_legible) sem.factura_original = 'verde';
  if (analysis.motor_numero_legible) sem.numero_motor = 'verde';
  return { success: true, analysis: analysis, semaforo: sem, confianza: analysis.confianza_general || 'media' };
}

function esc(s: any) { return String(s || '').replace(/[<>"'&]/g, ''); }
