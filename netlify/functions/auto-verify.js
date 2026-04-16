// =============================================
// AUTO-VERIFY — Motor de verificación automática
// Netlify Function — Alabol Car Broker
//
// Trigger: se llama cuando un expediente pasa a "pagado"
// Acción: corre todas las verificaciones automatizables,
//         pre-llena el semáforo y guarda resultados
// =============================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rgnunjngtsgqgvplawfr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NHTSA_API = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    var body = JSON.parse(event.body || '{}');
    var folio = body.folio;
    if (!folio) return { statusCode: 400, body: JSON.stringify({ error: 'Folio requerido' }) };

    // Init Supabase with service role (bypasses RLS)
    var sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Fetch expediente
    var { data: exp, error: fetchErr } = await sb
      .from('verificaciones')
      .select('*')
      .eq('folio', folio)
      .limit(1)
      .single();

    if (fetchErr || !exp) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Expediente no encontrado' }) };
    }

    var results = {
      checks: {},
      semaforo: {},
      score: 0,
      maxScore: 12,
      timestamp: new Date().toISOString()
    };

    // ─── CHECK 1: VIN Checksum ───
    var checksumResult = vinChecksum(exp.vin);
    results.checks.vin_checksum = checksumResult;
    results.semaforo.vin_valido = checksumResult.valid ? 'verde' : 'rojo';

    // ─── CHECK 2: NHTSA Decode + Cross-reference ───
    var nhtsaResult = await decodeNhtsa(exp.vin);
    results.checks.nhtsa = nhtsaResult;

    if (nhtsaResult.success) {
      var crossRef = crossReference(exp, nhtsaResult.data);
      results.checks.cross_reference = crossRef;
      // Si marca/modelo/año coinciden → verde. Si hay discrepancia → rojo (posible remarcado)
      results.semaforo.vin_no_remarcado = crossRef.match ? 'verde' : 'rojo';
    } else {
      results.semaforo.vin_no_remarcado = 'amarillo'; // No se pudo verificar
    }

    // ─── CHECK 3: REPUVE Scraping ───
    var repuveResult = await checkRepuve(exp.vin);
    results.checks.repuve = repuveResult;
    if (repuveResult.status === 'limpio') {
      results.semaforo.sin_reporte_robo = 'verde';
    } else if (repuveResult.status === 'reporte') {
      results.semaforo.sin_reporte_robo = 'rojo';
    } else {
      results.semaforo.sin_reporte_robo = 'amarillo'; // No se pudo consultar
    }

    // ─── CHECK 4: País de origen ───
    var country = detectCountry(exp.vin);
    results.checks.country = country;

    // ─── CHECK 5: Documentos (si hay fotos subidas) ───
    var fotos = exp.fotos || {};
    var hasTarjeta = !!fotos.tarjeta_circulacion;
    var hasFactura = !!fotos.factura;
    results.semaforo.documentos_completos = (hasTarjeta && hasFactura) ? 'verde' : 'rojo';
    results.semaforo.tarjeta_circulacion = hasTarjeta ? 'verde' : 'rojo';
    results.semaforo.factura_original = hasFactura ? 'verde' : 'amarillo';

    // ─── CHECK 6: Chip REPUVE (foto subida) ───
    var hasChip = !!fotos.chip_repuve;
    results.semaforo.chip_repuve = hasChip ? 'amarillo' : 'rojo'; // amarillo = subida pero requiere revisión visual

    // ─── CHECK 7: Número de motor (foto subida) ───
    var hasMotor = !!fotos.numero_motor;
    results.semaforo.numero_motor = hasMotor ? 'amarillo' : 'rojo';

    // ─── CHECK 8: Análisis de fotos con IA (si hay API key) ───
    if (ANTHROPIC_API_KEY && Object.keys(fotos).length > 0) {
      var aiResult = await analyzePhotosWithAI(sb, fotos, exp.vin, exp.marca, exp.modelo);
      results.checks.ai_analysis = aiResult;

      // AI puede refinar los puntos amarillo → verde o → rojo
      if (aiResult.success) {
        Object.keys(aiResult.semaforo).forEach(function(key) {
          // Solo sobrescribir si AI tiene más certeza (no bajar de verde a amarillo)
          if (results.semaforo[key] === 'amarillo' || !results.semaforo[key]) {
            results.semaforo[key] = aiResult.semaforo[key];
          }
        });
      }
    }

    // ─── Puntos que SIEMPRE requieren verificación humana ───
    // Estos quedan en amarillo para que el verificador los evalúe
    if (!results.semaforo.condicion_exterior) results.semaforo.condicion_exterior = 'amarillo';
    if (!results.semaforo.pintura_original) results.semaforo.pintura_original = 'amarillo';
    if (!results.semaforo.estructura_integra) results.semaforo.estructura_integra = 'amarillo';
    if (!results.semaforo.placas_vigentes) results.semaforo.placas_vigentes = 'amarillo';

    // ─── Calcular score ───
    var scoreMap = { verde: 1, amarillo: 0.5, rojo: 0 };
    Object.values(results.semaforo).forEach(function(v) {
      results.score += (scoreMap[v] || 0);
    });

    // ─── Guardar resultados ───
    var { error: updateErr } = await sb
      .from('verificaciones')
      .update({
        resultados_automaticos: results,
        semaforo: results.semaforo,
        nhtsa_data: nhtsaResult.success ? nhtsaResult.data : exp.nhtsa_data,
        repuve_status: repuveResult.status,
        vin_checksum_valido: checksumResult.valid,
        estatus: 'en_revision' // Auto-avanza a revisión
      })
      .eq('folio', folio);

    if (updateErr) throw updateErr;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folio: folio,
        score: results.score + '/' + results.maxScore,
        semaforo: results.semaforo,
        checks: Object.keys(results.checks).length,
        message: 'Verificacion automatica completada'
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Error interno' })
    };
  }
};

// ─── VIN CHECKSUM (ISO 3779) ───
function vinChecksum(vin) {
  if (!vin || vin.length !== 17) return { valid: false, error: 'VIN invalido' };
  vin = vin.toUpperCase();

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

// ─── NHTSA DECODE ───
async function decodeNhtsa(vin) {
  try {
    var resp = await fetch(NHTSA_API + '/' + vin + '?format=json', {
      signal: AbortSignal.timeout(8000)
    });
    if (!resp.ok) throw new Error('NHTSA status ' + resp.status);
    var json = await resp.json();
    var r = json.Results && json.Results[0];
    if (!r) return { success: false, error: 'Sin resultados' };

    var codes = (r.ErrorCode || '0').split(',').map(s => s.trim());
    if (!codes.includes('0')) return { success: false, error: r.ErrorText };

    return {
      success: true,
      data: {
        make: r.Make || '', model: r.Model || '',
        year: parseInt(r.ModelYear, 10) || null,
        bodyClass: r.BodyClass || '', fuelType: r.FuelTypePrimary || '',
        manufacturer: r.Manufacturer || '', plantCountry: r.PlantCountry || '',
        engineCylinders: r.EngineCylinders || '',
        engineDisplacement: r.DisplacementL || ''
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── CROSS-REFERENCE datos declarados vs NHTSA ───
function crossReference(exp, nhtsa) {
  var discrepancies = [];
  var declMake = (exp.marca || '').toUpperCase();
  var nhtsaMake = (nhtsa.make || '').toUpperCase();
  if (declMake && nhtsaMake && !nhtsaMake.includes(declMake) && !declMake.includes(nhtsaMake)) {
    discrepancies.push('Marca: ' + exp.marca + ' vs NHTSA: ' + nhtsa.make);
  }
  var declModel = (exp.modelo || '').toUpperCase();
  var nhtsaModel = (nhtsa.model || '').toUpperCase();
  if (declModel && nhtsaModel && !nhtsaModel.includes(declModel) && !declModel.includes(nhtsaModel)) {
    discrepancies.push('Modelo: ' + exp.modelo + ' vs NHTSA: ' + nhtsa.model);
  }
  if (exp.anio && nhtsa.year && exp.anio !== nhtsa.year) {
    discrepancies.push('Ano: ' + exp.anio + ' vs NHTSA: ' + nhtsa.year);
  }
  return { match: discrepancies.length === 0, discrepancies: discrepancies };
}

// ─── REPUVE SCRAPING ───
async function checkRepuve(vin) {
  try {
    // REPUVE usa HTTPS con certificado que puede fallar en Node.
    // Intentamos consultar; si falla, retornamos pendiente.
    var resp = await fetch('https://www2.repuve.gob.mx:8443/ciudadania/consulta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'niv=' + encodeURIComponent(vin),
      signal: AbortSignal.timeout(10000)
    });

    if (!resp.ok) throw new Error('REPUVE status ' + resp.status);
    var html = await resp.text();

    // Analizar respuesta HTML
    if (html.includes('NO SE ENCONTR') || html.includes('no se encontr')) {
      return { status: 'no_encontrado', message: 'VIN no encontrado en REPUVE' };
    }
    if (html.includes('ROBO') || html.includes('robo') || html.includes('REPORTE')) {
      return { status: 'reporte', message: 'ALERTA: Vehiculo con reporte activo en REPUVE' };
    }
    if (html.includes('INSCRITO') || html.includes('inscrito') || html.includes('VIGENTE')) {
      return { status: 'limpio', message: 'Vehiculo registrado en REPUVE sin reportes' };
    }

    return { status: 'pendiente', message: 'No se pudo interpretar la respuesta de REPUVE', raw: html.substring(0, 500) };
  } catch (err) {
    return { status: 'pendiente', message: 'No se pudo consultar REPUVE: ' + err.message };
  }
}

// ─── PAÍS DE ORIGEN ───
function detectCountry(vin) {
  if (!vin || vin.length < 2) return 'Desconocido';
  var wmi = vin.substring(0, 2).toUpperCase();
  var map = { '1':'USA','4':'USA','5':'USA','2':'Canada','J':'Japon','K':'Corea','L':'China','W':'Alemania','Z':'Italia','S':'UK' };
  if (wmi[0] === '3') return 'Mexico';
  return map[wmi] || map[wmi[0]] || 'Otro';
}

// ─── ANÁLISIS DE FOTOS CON CLAUDE VISION ───
async function analyzePhotosWithAI(sb, fotos, vin, marca, modelo) {
  if (!ANTHROPIC_API_KEY) return { success: false, error: 'API key no configurada' };

  try {
    // Descargar fotos de Supabase Storage como base64
    var photoData = [];
    var photoKeys = ['niv_tablero', 'niv_chasis', 'numero_motor', 'chip_repuve', 'tarjeta_circulacion', 'factura'];

    for (var key of photoKeys) {
      if (!fotos[key]) continue;
      var { data, error } = await sb.storage.from('verificaciones').download(fotos[key]);
      if (error || !data) continue;

      var buffer = Buffer.from(await data.arrayBuffer());
      var base64 = buffer.toString('base64');
      photoData.push({ key: key, base64: base64, mediaType: 'image/jpeg' });
    }

    if (photoData.length === 0) return { success: false, error: 'No se pudieron descargar fotos' };

    // Construir mensaje para Claude Vision
    var content = [];
    photoData.forEach(function(photo) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: photo.mediaType, data: photo.base64 }
      });
      content.push({
        type: 'text',
        text: 'Foto: ' + photo.key
      });
    });

    content.push({
      type: 'text',
      text: 'Eres un verificador vehicular experto en Mexico. Analiza estas ' + photoData.length + ' fotos de un vehiculo.\n\n' +
        'DATOS DECLARADOS:\n- VIN/NIV: ' + vin + '\n- Marca: ' + marca + '\n- Modelo: ' + modelo + '\n\n' +
        'ANALIZA Y RESPONDE EN JSON EXACTO (sin markdown):\n' +
        '{\n' +
        '  "vin_legible": true/false,\n' +
        '  "vin_leido": "el VIN que lees en la foto o null",\n' +
        '  "vin_coincide": true/false (si lo que lees coincide con ' + vin + '),\n' +
        '  "indicios_remarcado": true/false,\n' +
        '  "remarcado_detalle": "descripcion si hay indicios",\n' +
        '  "chip_repuve_legible": true/false,\n' +
        '  "tarjeta_legible": true/false,\n' +
        '  "factura_legible": true/false,\n' +
        '  "motor_numero_legible": true/false,\n' +
        '  "alertas": ["lista de alertas si hay"],\n' +
        '  "confianza_general": "alta/media/baja"\n' +
        '}'
    });

    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: content }]
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!resp.ok) {
      var errText = await resp.text();
      throw new Error('Claude API ' + resp.status + ': ' + errText.substring(0, 200));
    }

    var result = await resp.json();
    var textContent = result.content && result.content[0] && result.content[0].text;
    if (!textContent) throw new Error('Respuesta vacia de Claude');

    // Parse JSON response
    var analysis;
    try {
      // Limpiar posible markdown wrapping
      var jsonStr = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(jsonStr);
    } catch (e) {
      return { success: false, error: 'No se pudo parsear respuesta de IA', raw: textContent.substring(0, 500) };
    }

    // Convertir análisis a puntos de semáforo
    var semaforo = {};

    if (analysis.vin_coincide === true && !analysis.indicios_remarcado) {
      semaforo.vin_no_remarcado = 'verde';
    } else if (analysis.indicios_remarcado) {
      semaforo.vin_no_remarcado = 'rojo';
    }

    if (analysis.chip_repuve_legible) semaforo.chip_repuve = 'verde';
    if (analysis.tarjeta_legible) semaforo.tarjeta_circulacion = 'verde';
    if (analysis.factura_legible) semaforo.factura_original = 'verde';
    if (analysis.motor_numero_legible) semaforo.numero_motor = 'verde';

    return {
      success: true,
      analysis: analysis,
      semaforo: semaforo,
      confianza: analysis.confianza_general || 'media'
    };

  } catch (err) {
    return { success: false, error: err.message };
  }
}
