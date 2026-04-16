// =============================================
// AUTO-VERIFY — Motor de verificación automática
// Netlify Function — Alabol Car Broker
// Zero dependencies — usa fetch directo a Supabase REST API
// =============================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rgnunjngtsgqgvplawfr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NHTSA_API = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';

// ── Supabase REST helpers (no SDK needed) ──

async function sbSelect(table, query) {
  var url = SUPABASE_URL + '/rest/v1/' + table + '?' + query;
  var res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) throw new Error('Supabase SELECT error: ' + res.status);
  return res.json();
}

async function sbUpdate(table, match, data) {
  var url = SUPABASE_URL + '/rest/v1/' + table + '?' + match;
  var res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Supabase UPDATE error: ' + res.status + ' ' + await res.text());
}

async function sbStorageDownload(bucket, path) {
  var url = SUPABASE_URL + '/storage/v1/object/' + bucket + '/' + path;
  var res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY
    }
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

// ── Main handler ──

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    var body = JSON.parse(event.body || '{}');
    var folio = body.folio;
    if (!folio) return { statusCode: 400, body: JSON.stringify({ error: 'Folio requerido' }) };
    if (!SUPABASE_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada' }) };

    // 1. Fetch expediente
    var rows = await sbSelect('verificaciones', 'folio=eq.' + folio + '&limit=1');
    if (!rows || !rows.length) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Expediente no encontrado' }) };
    }
    var exp = rows[0];

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
      results.semaforo.vin_no_remarcado = crossRef.match ? 'verde' : 'rojo';
    } else {
      results.semaforo.vin_no_remarcado = 'amarillo';
    }

    // ─── CHECK 3: REPUVE ───
    var repuveResult = await checkRepuve(exp.vin);
    results.checks.repuve = repuveResult;
    if (repuveResult.status === 'limpio') {
      results.semaforo.sin_reporte_robo = 'verde';
    } else if (repuveResult.status === 'reporte') {
      results.semaforo.sin_reporte_robo = 'rojo';
    } else {
      results.semaforo.sin_reporte_robo = 'amarillo';
    }

    // ─── CHECK 4: País de origen ───
    results.checks.country = detectCountry(exp.vin);

    // ─── CHECK 5: Documentos ───
    var fotos = exp.fotos || {};
    var hasTarjeta = !!fotos.tarjeta_circulacion;
    var hasFactura = !!fotos.factura;
    results.semaforo.documentos_completos = (hasTarjeta && hasFactura) ? 'verde' : 'rojo';
    results.semaforo.tarjeta_circulacion = hasTarjeta ? 'verde' : 'rojo';
    results.semaforo.factura_original = hasFactura ? 'verde' : 'amarillo';
    results.semaforo.chip_repuve = fotos.chip_repuve ? 'amarillo' : 'rojo';
    results.semaforo.numero_motor = fotos.numero_motor ? 'amarillo' : 'rojo';

    // ─── CHECK 6: Análisis de fotos con Claude Vision ───
    if (ANTHROPIC_API_KEY && Object.keys(fotos).length > 0) {
      var aiResult = await analyzePhotosWithAI(fotos, exp.vin, exp.marca, exp.modelo);
      results.checks.ai_analysis = aiResult;

      if (aiResult.success && aiResult.semaforo) {
        Object.keys(aiResult.semaforo).forEach(function (key) {
          if (results.semaforo[key] === 'amarillo' || !results.semaforo[key]) {
            results.semaforo[key] = aiResult.semaforo[key];
          }
        });
      }
    }

    // ─── Puntos que requieren verificación humana ───
    if (!results.semaforo.condicion_exterior) results.semaforo.condicion_exterior = 'amarillo';
    if (!results.semaforo.pintura_original) results.semaforo.pintura_original = 'amarillo';
    if (!results.semaforo.estructura_integra) results.semaforo.estructura_integra = 'amarillo';
    if (!results.semaforo.placas_vigentes) results.semaforo.placas_vigentes = 'amarillo';

    // ─── Score ───
    var scoreMap = { verde: 1, amarillo: 0.5, rojo: 0 };
    Object.values(results.semaforo).forEach(function (v) {
      results.score += (scoreMap[v] || 0);
    });

    // ─── Guardar resultados ───
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

// ── VIN CHECKSUM (ISO 3779) ──

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

// ── NHTSA DECODE ──

async function decodeNhtsa(vin) {
  try {
    var res = await fetch(NHTSA_API + '/' + vin + '?format=json');
    if (!res.ok) throw new Error('NHTSA status ' + res.status);
    var json = await res.json();
    var r = json.Results && json.Results[0];
    if (!r) return { success: false, error: 'Sin resultados' };
    var codes = (r.ErrorCode || '0').split(',').map(function(s) { return s.trim(); });
    if (codes.indexOf('0') === -1) return { success: false, error: r.ErrorText };
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

// ── CROSS-REFERENCE ──

function crossReference(exp, nhtsa) {
  var discrepancies = [];
  var declMake = (exp.marca || '').toUpperCase();
  var nhtsaMake = (nhtsa.make || '').toUpperCase();
  if (declMake && nhtsaMake && nhtsaMake.indexOf(declMake) === -1 && declMake.indexOf(nhtsaMake) === -1) {
    discrepancies.push('Marca: ' + exp.marca + ' vs NHTSA: ' + nhtsa.make);
  }
  var declModel = (exp.modelo || '').toUpperCase();
  var nhtsaModel = (nhtsa.model || '').toUpperCase();
  if (declModel && nhtsaModel && nhtsaModel.indexOf(declModel) === -1 && declModel.indexOf(nhtsaModel) === -1) {
    discrepancies.push('Modelo: ' + exp.modelo + ' vs NHTSA: ' + nhtsa.model);
  }
  if (exp.anio && nhtsa.year && exp.anio !== nhtsa.year) {
    discrepancies.push('Ano: ' + exp.anio + ' vs NHTSA: ' + nhtsa.year);
  }
  return { match: discrepancies.length === 0, discrepancies: discrepancies };
}

// ── REPUVE ──

async function checkRepuve(vin) {
  try {
    var res = await fetch('https://www2.repuve.gob.mx:8443/ciudadania/consulta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'niv=' + encodeURIComponent(vin)
    });
    if (!res.ok) throw new Error('REPUVE status ' + res.status);
    var html = await res.text();
    if (html.indexOf('ROBO') !== -1 || html.indexOf('robo') !== -1 || html.indexOf('REPORTE') !== -1) {
      return { status: 'reporte', message: 'ALERTA: Vehiculo con reporte activo en REPUVE' };
    }
    if (html.indexOf('INSCRITO') !== -1 || html.indexOf('inscrito') !== -1 || html.indexOf('VIGENTE') !== -1) {
      return { status: 'limpio', message: 'Vehiculo registrado en REPUVE sin reportes' };
    }
    if (html.indexOf('NO SE ENCONTR') !== -1 || html.indexOf('no se encontr') !== -1) {
      return { status: 'no_encontrado', message: 'VIN no encontrado en REPUVE' };
    }
    return { status: 'pendiente', message: 'No se pudo interpretar respuesta REPUVE' };
  } catch (err) {
    return { status: 'pendiente', message: 'REPUVE no disponible: ' + err.message };
  }
}

// ── PAÍS DE ORIGEN ──

function detectCountry(vin) {
  if (!vin || vin.length < 2) return 'Desconocido';
  var first = vin[0].toUpperCase();
  if (first === '3') return 'Mexico';
  var map = {'1':'USA','4':'USA','5':'USA','2':'Canada','J':'Japon','K':'Corea','L':'China','W':'Alemania','Z':'Italia','S':'UK'};
  return map[first] || 'Otro';
}

// ── CLAUDE VISION ANALYSIS ──

async function analyzePhotosWithAI(fotos, vin, marca, modelo) {
  if (!ANTHROPIC_API_KEY) return { success: false, error: 'API key no configurada' };

  try {
    var photoKeys = ['niv_tablero', 'niv_chasis', 'numero_motor', 'chip_repuve', 'tarjeta_circulacion', 'factura'];
    var content = [];

    for (var k = 0; k < photoKeys.length; k++) {
      var key = photoKeys[k];
      if (!fotos[key]) continue;
      var imgData = await sbStorageDownload('verificaciones', fotos[key]);
      if (!imgData) continue;
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: imgData.toString('base64') }
      });
      content.push({ type: 'text', text: 'Foto: ' + key });
    }

    if (content.length === 0) return { success: false, error: 'No se pudieron descargar fotos' };

    content.push({
      type: 'text',
      text: 'Eres un verificador vehicular experto en Mexico. Analiza estas fotos.\n\n' +
        'DATOS DECLARADOS: VIN: ' + vin + ' | Marca: ' + marca + ' | Modelo: ' + modelo + '\n\n' +
        'RESPONDE EN JSON EXACTO (sin markdown, sin backticks):\n' +
        '{"vin_legible":true/false,"vin_leido":"el VIN que lees o null","vin_coincide":true/false,' +
        '"indicios_remarcado":true/false,"remarcado_detalle":"descripcion o null",' +
        '"chip_repuve_legible":true/false,"tarjeta_legible":true/false,"factura_legible":true/false,' +
        '"motor_numero_legible":true/false,"alertas":["lista"],"confianza_general":"alta/media/baja"}'
    });

    var res = await fetch('https://api.anthropic.com/v1/messages', {
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
      })
    });

    if (!res.ok) {
      var errText = await res.text();
      throw new Error('Claude API ' + res.status + ': ' + errText.substring(0, 200));
    }

    var result = await res.json();
    var textContent = result.content && result.content[0] && result.content[0].text;
    if (!textContent) throw new Error('Respuesta vacia de Claude');

    var jsonStr = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    var analysis = JSON.parse(jsonStr);

    var semaforo = {};
    if (analysis.vin_coincide === true && !analysis.indicios_remarcado) semaforo.vin_no_remarcado = 'verde';
    else if (analysis.indicios_remarcado) semaforo.vin_no_remarcado = 'rojo';
    if (analysis.chip_repuve_legible) semaforo.chip_repuve = 'verde';
    if (analysis.tarjeta_legible) semaforo.tarjeta_circulacion = 'verde';
    if (analysis.factura_legible) semaforo.factura_original = 'verde';
    if (analysis.motor_numero_legible) semaforo.numero_motor = 'verde';

    return { success: true, analysis: analysis, semaforo: semaforo, confianza: analysis.confianza_general || 'media' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
