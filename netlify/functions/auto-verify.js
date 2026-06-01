// =============================================
// AUTO-VERIFY — Motor de verificación automática
// Netlify Function — Alabol Car Broker
// =============================================

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
var INTERNAL_SECRET = process.env.INTERNAL_SECRET;
var NHTSA_API = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';

// ── Auth guard ──
function checkAuth(event) {
  var secret = event.headers['x-internal-key'] || '';
  var authHeader = event.headers['authorization'] || '';
  if (INTERNAL_SECRET && secret === INTERNAL_SECRET) return true;
  if (authHeader && SUPABASE_KEY) return true; // Has a bearer token
  return false;
}

// ── Supabase REST helpers ──
async function sbSelect(table, query) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error('DB SELECT error: ' + res.status);
  return res.json();
}

async function sbUpdate(table, match, data) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + match, {
    method: 'PATCH',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('DB UPDATE error: ' + res.status + ' ' + await res.text());
}

async function sbStorageDownload(bucket, path) {
  var res = await fetch(SUPABASE_URL + '/storage/v1/object/' + bucket + '/' + path, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  if (!SUPABASE_URL || !SUPABASE_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'Server config missing' }) };
  if (!checkAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado' }) };

  try {
    var body = JSON.parse(event.body || '{}');
    var folio = (body.folio || '').replace(/[^A-Z0-9\-]/gi, '').substring(0, 12);
    if (!folio) return { statusCode: 400, body: JSON.stringify({ error: 'Folio requerido' }) };

    var rows = await sbSelect('verificaciones', 'folio=eq.' + folio + '&limit=1');
    if (!rows || !rows.length) return { statusCode: 404, body: JSON.stringify({ error: 'No encontrado' }) };
    var exp = rows[0];

    var results = { checks: {}, semaforo: {}, score: 0, maxScore: 12, timestamp: new Date().toISOString() };

    // ── CHECK 1: VIN Checksum ──
    var checksumResult = vinChecksum(exp.vin);
    results.checks.vin_checksum = checksumResult;
    results.semaforo.vin_valido = checksumResult.valid ? 'verde' : checksumResult.skipped ? 'amarillo' : 'rojo';

    // ── CHECK 2 & 3: NHTSA + REPUVE in parallel ──
    var controller1 = new AbortController();
    var t1 = setTimeout(function () { controller1.abort(); }, 6000);
    var controller2 = new AbortController();
    var t2 = setTimeout(function () { controller2.abort(); }, 8000);

    var parallelResults = await Promise.allSettled([
      decodeNhtsa(exp.vin, controller1.signal),
      checkRepuve(exp.vin, controller2.signal)
    ]);
    clearTimeout(t1);
    clearTimeout(t2);

    var nhtsaResult = parallelResults[0].status === 'fulfilled' ? parallelResults[0].value : { success: false, error: 'Timeout' };
    var repuveResult = parallelResults[1].status === 'fulfilled' ? parallelResults[1].value : { status: 'pendiente', message: 'Timeout' };

    results.checks.nhtsa = nhtsaResult;
    if (nhtsaResult.success) {
      var crossRef = crossReference(exp, nhtsaResult.data);
      results.checks.cross_reference = crossRef;
      results.semaforo.vin_no_remarcado = crossRef.match ? 'verde' : 'rojo';
    } else {
      results.semaforo.vin_no_remarcado = 'amarillo';
    }

    results.checks.repuve = repuveResult;
    // REPUVE: NUNCA marcar verde automáticamente — siempre amarillo (requiere confirmación humana)
    results.semaforo.sin_reporte_robo = repuveResult.status === 'reporte' ? 'rojo' : 'amarillo';

    // ── CHECK 4: País de origen ──
    results.checks.country = detectCountry(exp.vin);

    // ── CHECK 5: Documentos ──
    var fotos = exp.fotos || {};
    results.semaforo.documentos_completos = (fotos.tarjeta_circulacion && fotos.factura) ? 'verde' : 'rojo';
    results.semaforo.tarjeta_circulacion = fotos.tarjeta_circulacion ? 'verde' : 'rojo';
    results.semaforo.factura_original = fotos.factura ? 'verde' : 'amarillo';
    results.semaforo.chip_repuve = fotos.chip_repuve ? 'amarillo' : 'rojo';
    results.semaforo.numero_motor = fotos.numero_motor ? 'amarillo' : 'rojo';

    // ── CHECK 6: Claude Vision (si hay API key y fotos) ──
    if (ANTHROPIC_API_KEY && Object.keys(fotos).length > 0) {
      try {
        var aiResult = await analyzePhotosWithAI(fotos, exp.vin, exp.marca, exp.modelo);
        results.checks.ai_analysis = aiResult;
        if (aiResult.success && aiResult.semaforo) {
          Object.keys(aiResult.semaforo).forEach(function (key) {
            if (results.semaforo[key] === 'amarillo' || !results.semaforo[key]) {
              results.semaforo[key] = aiResult.semaforo[key];
            }
          });
        }
      } catch (aiErr) {
        results.checks.ai_analysis = { success: false, error: aiErr.message };
      }
    }

    // ── Puntos que SIEMPRE requieren humano → amarillo ──
    ['condicion_exterior', 'pintura_original', 'estructura_integra', 'placas_vigentes'].forEach(function (k) {
      if (!results.semaforo[k]) results.semaforo[k] = 'amarillo';
    });

    // ── Score ──
    var scoreMap = { verde: 1, amarillo: 0.5, rojo: 0 };
    Object.values(results.semaforo).forEach(function (v) { results.score += (scoreMap[v] || 0); });

    // ── Guardar ──
    await sbUpdate('verificaciones', 'folio=eq.' + folio, {
      resultados_automaticos: results,
      semaforo: results.semaforo,
      nhtsa_data: nhtsaResult.success ? nhtsaResult.data : (exp.nhtsa_data || {}),
      repuve_status: repuveResult.status,
      vin_checksum_valido: checksumResult.valid,
      estatus: 'en_revision'
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folio: folio, score: results.score + '/' + results.maxScore, semaforo: results.semaforo, checks: Object.keys(results.checks).length, message: 'Verificacion automatica completada' })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Error interno' }) };
  }
};

// ── VIN CHECKSUM ──
function vinChecksum(vin) {
  if (!vin || vin.length !== 17) return { valid: false, error: 'VIN invalido' };
  vin = vin.toUpperCase();
  // Skip checksum for non-North American VINs
  var firstChar = vin[0];
  if (!('12345'.indexOf(firstChar) !== -1 || firstChar === '3')) {
    return { valid: true, skipped: true, note: 'Checksum no aplica para VINs fuera de Norteamerica' };
  }
  var trans = {A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9};
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
async function decodeNhtsa(vin, signal) {
  var res = await fetch(NHTSA_API + '/' + vin + '?format=json', { signal: signal });
  if (!res.ok) throw new Error('NHTSA status ' + res.status);
  var json = await res.json();
  var r = json.Results && json.Results[0];
  if (!r) return { success: false, error: 'Sin resultados' };
  var codes = (r.ErrorCode || '0').split(',').map(function (s) { return s.trim(); });
  if (codes.indexOf('0') === -1) return { success: false, error: r.ErrorText };
  return {
    success: true,
    data: { make: r.Make || '', model: r.Model || '', year: parseInt(r.ModelYear, 10) || null, bodyClass: r.BodyClass || '', fuelType: r.FuelTypePrimary || '', manufacturer: r.Manufacturer || '', plantCountry: r.PlantCountry || '', engineCylinders: r.EngineCylinders || '', engineDisplacement: r.DisplacementL || '' }
  };
}

// ── CROSS-REFERENCE ──
function crossReference(exp, nhtsa) {
  var disc = [];
  var dm = (exp.marca || '').toUpperCase(), nm = (nhtsa.make || '').toUpperCase();
  if (dm && nm && nm.indexOf(dm) === -1 && dm.indexOf(nm) === -1) disc.push('Marca: ' + exp.marca + ' vs ' + nhtsa.make);
  var dmo = (exp.modelo || '').toUpperCase(), nmo = (nhtsa.model || '').toUpperCase();
  if (dmo && nmo && nmo.indexOf(dmo) === -1 && dmo.indexOf(nmo) === -1) disc.push('Modelo: ' + exp.modelo + ' vs ' + nhtsa.model);
  if (exp.anio && nhtsa.year && exp.anio !== nhtsa.year) disc.push('Ano: ' + exp.anio + ' vs ' + nhtsa.year);
  return { match: disc.length === 0, discrepancies: disc };
}

// ── REPUVE ──
async function checkRepuve(vin, signal) {
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
    return { status: 'pendiente', message: 'REPUVE no disponible: ' + err.message };
  }
}

// ── PAÍS ──
function detectCountry(vin) {
  if (!vin || vin.length < 2) return 'Desconocido';
  var wmi = vin.substring(0, 2).toUpperCase();
  if (wmi[0] === '3') return 'Mexico';
  var map = { '1': 'USA', '4': 'USA', '5': 'USA', '2': 'Canada', 'J': 'Japon', 'K': 'Corea', 'L': 'China', 'W': 'Alemania', 'Z': 'Italia', 'S': 'UK' };
  return map[wmi] || map[wmi[0]] || 'Otro';
}

// ── CLAUDE VISION ──
async function analyzePhotosWithAI(fotos, vin, marca, modelo) {
  if (!ANTHROPIC_API_KEY) return { success: false, error: 'API key no configurada' };
  var photoKeys = ['niv_tablero', 'niv_chasis', 'numero_motor', 'chip_repuve', 'tarjeta_circulacion', 'factura'];
  var content = [];
  for (var k = 0; k < photoKeys.length; k++) {
    var key = photoKeys[k];
    if (!fotos[key]) continue;
    var imgData = await sbStorageDownload('verificaciones', fotos[key]);
    if (!imgData) continue;
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imgData.toString('base64') } });
    content.push({ type: 'text', text: 'Foto: ' + key });
  }
  if (content.length === 0) return { success: false, error: 'No se pudieron descargar fotos' };

  content.push({ type: 'text', text: 'Eres un verificador vehicular experto en Mexico. Analiza estas fotos.\nDATOS DECLARADOS: VIN: ' + esc(vin) + ' | Marca: ' + esc(marca) + ' | Modelo: ' + esc(modelo) + '\nRESPONDE EN JSON (sin markdown):\n{"vin_legible":true/false,"vin_leido":"string o null","vin_coincide":true/false,"indicios_remarcado":true/false,"remarcado_detalle":"string o null","chip_repuve_legible":true/false,"tarjeta_legible":true/false,"factura_legible":true/false,"motor_numero_legible":true/false,"alertas":[],"confianza_general":"alta/media/baja"}' });

  var res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, messages: [{ role: 'user', content: content }] })
  });
  if (!res.ok) throw new Error('Claude API ' + res.status);
  var result = await res.json();
  var txt = result.content && result.content[0] && result.content[0].text;
  if (!txt) throw new Error('Respuesta vacia');
  var analysis = JSON.parse(txt.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  var sem = {};
  if (analysis.vin_coincide === true && !analysis.indicios_remarcado) sem.vin_no_remarcado = 'verde';
  else if (analysis.indicios_remarcado) sem.vin_no_remarcado = 'rojo';
  if (analysis.chip_repuve_legible) sem.chip_repuve = 'verde';
  if (analysis.tarjeta_legible) sem.tarjeta_circulacion = 'verde';
  if (analysis.factura_legible) sem.factura_original = 'verde';
  if (analysis.motor_numero_legible) sem.numero_motor = 'verde';
  return { success: true, analysis: analysis, semaforo: sem, confianza: analysis.confianza_general || 'media' };
}

function esc(s) { return String(s || '').replace(/[<>"'&]/g, ''); }
