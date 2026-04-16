// =============================================
// SEND-NOTIFICATION — Email al cliente
// Netlify Function — Alabol Car Broker
// Se llama cuando cambia el estatus de una verificacion
// =============================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rgnunjngtsgqgvplawfr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = 'https://alabolcar.com.mx';

async function sbSelect(table, query) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) throw new Error('Supabase error: ' + res.status);
  return res.json();
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    var body = JSON.parse(event.body || '{}');
    var folio = body.folio;
    var tipo = body.tipo || 'dictamen'; // dictamen | confirmacion | pago

    if (!folio || !SUPABASE_KEY) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Folio y config requeridos' }) };
    }

    var rows = await sbSelect('verificaciones', 'folio=eq.' + folio + '&limit=1');
    if (!rows || !rows.length) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Expediente no encontrado' }) };
    }

    var exp = rows[0];
    var email = exp.email_solicitante;
    if (!email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Sin email de contacto' }) };
    }

    var subject, htmlBody;

    if (tipo === 'dictamen') {
      var resultado = exp.resultado_final || 'pendiente';
      var esAprobado = resultado === 'aprobado' || resultado === 'aprobado_con_observaciones';
      var emoji = esAprobado ? '✅' : resultado === 'no_aprobado' ? '🚨' : '⏳';
      var statusText = resultado === 'aprobado' ? 'APROBADO — Green Flags' :
                       resultado === 'aprobado_con_observaciones' ? 'APROBADO CON OBSERVACIONES — Yellow Flags' :
                       'NO APROBADO — Red Flags';

      subject = emoji + ' Resultado de tu verificacion ' + folio + ' — Alabol';
      htmlBody = buildDictamenEmail(exp, statusText, esAprobado);
    } else if (tipo === 'confirmacion') {
      subject = '📋 Solicitud recibida — ' + folio + ' — Alabol';
      htmlBody = buildConfirmacionEmail(exp);
    }

    // Send via Supabase Edge (auth.admin) or fallback to Resend/SMTP
    // For now: use Supabase's built-in email via auth hook workaround
    // Alternative: direct SMTP or Resend API

    // Using fetch to a simple email API — Resend is the simplest
    var RESEND_KEY = process.env.RESEND_API_KEY;

    if (RESEND_KEY) {
      var emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + RESEND_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Alabol Car Broker <verificacion@alabolcar.com.mx>',
          to: [email],
          subject: subject,
          html: htmlBody
        })
      });

      if (!emailRes.ok) {
        var errText = await emailRes.text();
        throw new Error('Resend error: ' + errText.substring(0, 200));
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, to: email, tipo: tipo })
      };
    }

    // Fallback: Supabase Edge Function hook (si no hay Resend)
    // Por ahora retornamos el HTML para preview
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        preview: true,
        to: email,
        subject: subject,
        message: 'Email generado pero no enviado — configura RESEND_API_KEY para envio automatico',
        html: htmlBody
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Error interno' })
    };
  }
};

function buildDictamenEmail(exp, statusText, esAprobado) {
  var certUrl = SITE_URL + '/certificado/' + exp.folio;
  var vehiculo = (exp.marca || '') + ' ' + (exp.modelo || '') + ' ' + (exp.anio || '');
  var semaforo = exp.semaforo || {};

  var semaforoHtml = '';
  var puntos = {
    vin_valido: 'NIV valido',
    vin_no_remarcado: 'Sin remarcado',
    sin_reporte_robo: 'Sin reporte robo',
    documentos_completos: 'Documentos',
    tarjeta_circulacion: 'Tarjeta circ.',
    factura_original: 'Factura',
    chip_repuve: 'Chip REPUVE',
    numero_motor: 'Num. motor',
    condicion_exterior: 'Exterior',
    pintura_original: 'Pintura',
    estructura_integra: 'Estructura',
    placas_vigentes: 'Placas'
  };

  Object.keys(puntos).forEach(function (key) {
    var val = semaforo[key] || 'pendiente';
    var dot = val === 'verde' ? '🟢' : val === 'amarillo' ? '🟡' : val === 'rojo' ? '🔴' : '⚪';
    semaforoHtml += '<tr><td style="padding:4px 8px;font-size:13px">' + dot + ' ' + puntos[key] + '</td></tr>';
  });

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#0a1f1a;font-family:Arial,sans-serif">' +
    '<div style="max-width:600px;margin:0 auto;background:#0a1f1a;color:#a8c5b8">' +

    // Header
    '<div style="background:#0d2921;padding:24px;text-align:center;border-bottom:2px solid #d4af37">' +
    '<h1 style="color:#d4af37;margin:0;font-size:22px">Alabol Car Broker</h1>' +
    '<p style="color:#a8c5b8;margin:4px 0 0;font-size:12px">El Tinder de los Autos — Verificacion Vehicular</p>' +
    '</div>' +

    // Status banner
    '<div style="padding:20px 24px;text-align:center;background:' + (esAprobado ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)') + '">' +
    '<h2 style="color:' + (esAprobado ? '#34d399' : '#ef4444') + ';margin:0;font-size:18px">' + statusText + '</h2>' +
    '<p style="color:#d4af37;font-size:24px;font-weight:bold;margin:8px 0">' + exp.folio + '</p>' +
    '</div>' +

    // Vehicle info
    '<div style="padding:20px 24px">' +
    '<h3 style="color:white;font-size:16px;margin:0 0 12px">Vehiculo: ' + vehiculo + '</h3>' +
    '<p style="font-size:13px;margin:4px 0">NIV: <strong style="color:white;font-family:monospace">' + (exp.vin || 'N/A') + '</strong></p>' +
    '<p style="font-size:13px;margin:4px 0">Placas: <strong style="color:white">' + (exp.placas || 'N/A') + '</strong></p>' +
    '</div>' +

    // Semaforo
    '<div style="padding:0 24px 20px">' +
    '<h3 style="color:#d4af37;font-size:14px;margin:0 0 8px">Puntos de Verificacion</h3>' +
    '<table style="width:100%">' + semaforoHtml + '</table>' +
    '</div>' +

    // Notas
    (exp.notas_verificador ? '<div style="padding:0 24px 20px"><h3 style="color:#d4af37;font-size:14px;margin:0 0 8px">Observaciones</h3><p style="font-size:13px;background:#0d2921;padding:12px;border-radius:8px">' + exp.notas_verificador + '</p></div>' : '') +

    // CTA
    '<div style="padding:20px 24px;text-align:center">' +
    '<a href="' + certUrl + '" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#c9a961);color:#0a1f1a;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:14px">Ver Certificado Completo</a>' +
    (esAprobado ? '<p style="font-size:12px;margin-top:12px">Tambien puedes descargar tu certificado PDF desde el link</p>' : '') +
    '</div>' +

    // Footer
    '<div style="padding:20px 24px;text-align:center;border-top:1px solid rgba(212,175,55,0.2);font-size:11px;color:#6b8f7b">' +
    '<p>Alabol Car Broker — El Tinder de los Autos</p>' +
    '<p>alabolcar.com.mx | WhatsApp: +52 55 6866 7571</p>' +
    '</div>' +

    '</div></body></html>';
}

function buildConfirmacionEmail(exp) {
  var vehiculo = (exp.marca || '') + ' ' + (exp.modelo || '') + ' ' + (exp.anio || '');

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#0a1f1a;font-family:Arial,sans-serif">' +
    '<div style="max-width:600px;margin:0 auto;background:#0a1f1a;color:#a8c5b8">' +

    '<div style="background:#0d2921;padding:24px;text-align:center;border-bottom:2px solid #d4af37">' +
    '<h1 style="color:#d4af37;margin:0;font-size:22px">Alabol Car Broker</h1>' +
    '<p style="color:#a8c5b8;margin:4px 0 0;font-size:12px">El Tinder de los Autos — Verificacion Vehicular</p>' +
    '</div>' +

    '<div style="padding:24px;text-align:center">' +
    '<h2 style="color:white;font-size:20px;margin:0 0 8px">Tu background check esta en camino</h2>' +
    '<p style="color:#d4af37;font-size:28px;font-weight:bold;margin:12px 0">' + exp.folio + '</p>' +
    '<p style="font-size:14px;line-height:1.6">Recibimos la solicitud para verificar tu <strong style="color:white">' + vehiculo + '</strong>.</p>' +
    '<p style="font-size:14px;line-height:1.6">Te notificaremos por correo cuando el dictamen este listo.</p>' +
    '</div>' +

    '<div style="padding:0 24px 20px">' +
    '<div style="background:#0d2921;border-radius:12px;padding:16px">' +
    '<h3 style="color:#d4af37;font-size:13px;margin:0 0 10px">Siguientes pasos</h3>' +
    '<p style="font-size:13px;margin:4px 0">1. Realiza el pago con el enlace que recibiras</p>' +
    '<p style="font-size:13px;margin:4px 0">2. Nuestro verificador revisa tu expediente en 24-48 hrs</p>' +
    '<p style="font-size:13px;margin:4px 0">3. Recibiras tu certificado por correo</p>' +
    '</div>' +
    '</div>' +

    '<div style="padding:20px 24px;text-align:center">' +
    '<a href="' + SITE_URL + '/certificado/' + exp.folio + '" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#c9a961);color:#0a1f1a;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:14px">Consultar Estado</a>' +
    '</div>' +

    '<div style="padding:20px 24px;text-align:center;border-top:1px solid rgba(212,175,55,0.2);font-size:11px;color:#6b8f7b">' +
    '<p>Alabol Car Broker — El Tinder de los Autos</p>' +
    '<p>alabolcar.com.mx | WhatsApp: +52 55 6866 7571</p>' +
    '</div>' +

    '</div></body></html>';
}
