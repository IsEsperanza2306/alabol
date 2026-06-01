// =============================================
// EMITIR-DICTAMEN — Panel Perito sin auth
// Netlify Function — Alabol Car Broker
// =============================================

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var SITE_URL = process.env.URL || 'https://alabolcar.com.mx';

var RESULTADOS_VALIDOS = ['aprobado', 'aprobado_con_observaciones', 'no_aprobado'];

function sbHeaders() {
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

async function sbSelect(table, query) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
    headers: sbHeaders()
  });
  if (!res.ok) throw new Error('DB read error: ' + res.status);
  return res.json();
}

async function sbPatch(table, query, data) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
    method: 'PATCH',
    headers: Object.assign({}, sbHeaders(), { 'Prefer': 'return=minimal' }),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    var text = await res.text();
    throw new Error('DB update error ' + res.status + ': ' + text.substring(0, 300));
  }
  return true;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Configuración del servidor incompleta' }) };
  }

  var body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  // Sanitizar entradas
  var folio = String(body.folio || '').replace(/[^A-Z0-9\-]/gi, '').substring(0, 20).toUpperCase();
  var semaforo = (body.semaforo && typeof body.semaforo === 'object') ? body.semaforo : {};
  var notas = String(body.notas || '').substring(0, 2000);
  var resultado = body.resultado;

  // Validaciones
  if (!folio) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Folio requerido' }) };
  }

  if (!RESULTADOS_VALIDOS.includes(resultado)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Resultado inválido. Debe ser: ' + RESULTADOS_VALIDOS.join(', ') }) };
  }

  // Sanitizar semaforo: solo claves y valores conocidos
  var CLAVES_SEM = [
    'documentos_completos', 'vin_valido', 'vin_no_remarcado', 'placas_vigentes',
    'sin_reporte_robo', 'factura_original', 'tarjeta_circulacion', 'chip_repuve',
    'numero_motor', 'condicion_exterior', 'pintura_original', 'estructura_integra'
  ];
  var VALORES_SEM = ['verde', 'amarillo', 'rojo'];
  var semaforoLimpio = {};
  CLAVES_SEM.forEach(function (clave) {
    if (VALORES_SEM.includes(semaforo[clave])) {
      semaforoLimpio[clave] = semaforo[clave];
    }
  });

  try {
    // Verificar que el expediente existe y está en estado procesable
    var rows = await sbSelect('verificaciones', 'folio=eq.' + folio + '&limit=1');
    if (!rows || !rows.length) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Verificación no encontrada: ' + folio }) };
    }

    var exp = rows[0];

    // No permitir emitir si ya tiene resultado
    if (exp.resultado_final) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: 'Este expediente ya tiene un dictamen emitido',
          resultado_existente: exp.resultado_final
        })
      };
    }

    // Verificar que tenga un estatus procesable
    var estatusProcesables = ['pagado', 'en_revision', 'pendiente_pago'];
    if (!estatusProcesables.includes(exp.estatus)) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: 'El expediente tiene estatus "' + exp.estatus + '" y no puede recibir dictamen'
        })
      };
    }

    // Determinar estatus final
    var estatusFinal = resultado === 'no_aprobado' ? 'rechazado' : resultado;

    var ahora = new Date().toISOString();
    var vigencia = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Actualizar en Supabase
    await sbPatch('verificaciones', 'folio=eq.' + folio, {
      semaforo: semaforoLimpio,
      notas_verificador: notas,
      resultado_final: resultado,
      estatus: estatusFinal,
      aprobado_at: ahora,
      vigencia_certificado: vigencia
    });

    // Notificar al cliente por email (fire-and-forget, no bloqueante)
    notificarCliente(folio).catch(function (e) {
      // Error de notificación — no interrumpe el flujo principal
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, resultado: resultado, folio: folio })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Error interno al emitir dictamen' })
    };
  }
};

async function notificarCliente(folio) {
  var notifUrl = SITE_URL + '/.netlify/functions/send-notification';
  var res = await fetch(notifUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer internal'
    },
    body: JSON.stringify({ folio: folio, tipo: 'dictamen' })
  });
  return res.ok;
}
