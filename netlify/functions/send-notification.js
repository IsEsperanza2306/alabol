// =============================================
// SEND-NOTIFICATION — Email al cliente
// Netlify Function — Alabol Car Broker
// =============================================

var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var INTERNAL_SECRET = process.env.INTERNAL_SECRET;
var SITE_URL = 'https://alabolcar.com.mx';

function checkAuth(event) {
  var secret = event.headers['x-internal-key'] || '';
  if (INTERNAL_SECRET && secret === INTERNAL_SECRET) return true;
  var authHeader = event.headers['authorization'] || '';
  if (authHeader) return true;
  return false;
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

async function sbSelect(table, query) {
  var res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + query, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error('DB error: ' + res.status);
  return res.json();
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  if (!SUPABASE_URL || !SUPABASE_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'Config missing' }) };
  if (!checkAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado' }) };

  try {
    var body = JSON.parse(event.body || '{}');
    var folio = (body.folio || '').replace(/[^A-Z0-9\-]/gi, '').substring(0, 12);
    var tipo = body.tipo || 'dictamen';
    if (!folio) return { statusCode: 400, body: JSON.stringify({ error: 'Folio requerido' }) };

    var rows = await sbSelect('verificaciones', 'folio=eq.' + folio + '&limit=1');
    if (!rows || !rows.length) return { statusCode: 404, body: JSON.stringify({ error: 'No encontrado' }) };
    var exp = rows[0];
    var email = exp.email_solicitante;
    if (!email) return { statusCode: 400, body: JSON.stringify({ error: 'Sin email' }) };

    var subject, htmlBody;
    if (tipo === 'nueva_solicitud_interna') {
      var vehiculoInterno = esc((exp.marca || '') + ' ' + (exp.modelo || '') + ' ' + (exp.anio || ''));
      subject = '🚗 Nueva solicitud de verificacion — ' + esc(folio) + ' | ' + vehiculoInterno;
      htmlBody = buildNuevaSolicitudEmail(exp);
      var RESEND_KEY_INT = process.env.RESEND_API_KEY;
      var RESEND_FROM_INT = process.env.RESEND_FROM || 'Alabol Car Broker <onboarding@resend.dev>';
      if (RESEND_KEY_INT) {
        var intRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + RESEND_KEY_INT, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: RESEND_FROM_INT, to: ['israel.esperanza.h@gmail.com'], subject: subject, html: htmlBody })
        });
        var intBody = await intRes.text();
        if (!intRes.ok) {
          return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: 'Resend interno: ' + intBody.substring(0, 200) }) };
        }
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, sent: true, to: 'israel.esperanza.h@gmail.com', tipo: tipo }) };
      }
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, preview: true, subject: subject, html: htmlBody }) };
    }

    if (tipo === 'dictamen') {
      var resultado = exp.resultado_final || 'pendiente';
      var esAprobado = resultado === 'aprobado' || resultado === 'aprobado_con_observaciones';
      var emoji = esAprobado ? '✅' : resultado === 'no_aprobado' ? '🚨' : '⏳';
      var statusText = resultado === 'aprobado' ? 'APROBADO — Green Flags' : resultado === 'aprobado_con_observaciones' ? 'APROBADO CON OBSERVACIONES — Yellow Flags' : 'NO APROBADO — Red Flags';
      subject = emoji + ' Resultado de tu verificacion ' + esc(folio) + ' — Alabol';
      htmlBody = buildDictamenEmail(exp, statusText, esAprobado);
    } else {
      subject = '📋 Solicitud recibida — ' + esc(folio) + ' — Alabol';
      htmlBody = buildConfirmacionEmail(exp);
    }

    var isPreview = body.preview === true;
    var RESEND_KEY = process.env.RESEND_API_KEY;
    var RESEND_FROM = process.env.RESEND_FROM || 'Alabol Car Broker <onboarding@resend.dev>';

    if (isPreview) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, preview: true, to: email, subject: subject, html: htmlBody }) };
    }

    if (RESEND_KEY) {
      var emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: RESEND_FROM, to: [email], subject: subject, html: htmlBody })
      });
      var resBody = await emailRes.text();
      if (!emailRes.ok) {
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: 'Resend: ' + resBody.substring(0, 200), to: email, html: htmlBody }) };
      }
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, sent: true, to: email, tipo: tipo }) };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, preview: true, to: email, subject: subject, html: htmlBody }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Error interno' }) };
  }
};

function buildDictamenEmail(exp, statusText, esAprobado) {
  var certUrl = SITE_URL + '/certificado/' + esc(exp.folio);
  var vehiculo = esc((exp.marca || '') + ' ' + (exp.modelo || '') + ' ' + (exp.anio || ''));
  var semaforo = exp.semaforo || {};
  var puntos = { vin_valido:'NIV valido', vin_no_remarcado:'Sin remarcado', sin_reporte_robo:'Sin reporte robo', documentos_completos:'Documentos', tarjeta_circulacion:'Tarjeta circ.', factura_original:'Factura', chip_repuve:'Chip REPUVE', numero_motor:'Num. motor', condicion_exterior:'Exterior', pintura_original:'Pintura', estructura_integra:'Estructura', placas_vigentes:'Placas' };
  var semaforoHtml = '';
  Object.keys(puntos).forEach(function (k) {
    var val = semaforo[k] || 'pendiente';
    var dot = val === 'verde' ? '🟢' : val === 'amarillo' ? '🟡' : val === 'rojo' ? '🔴' : '⚪';
    semaforoHtml += '<tr><td style="padding:4px 8px;font-size:13px">' + dot + ' ' + puntos[k] + '</td></tr>';
  });

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#0a1f1a;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;background:#0a1f1a;color:#a8c5b8">' +
    '<div style="background:#0d2921;padding:24px;text-align:center;border-bottom:2px solid #d4af37"><h1 style="color:#d4af37;margin:0;font-size:22px">Alabol Car Broker</h1><p style="color:#a8c5b8;margin:4px 0 0;font-size:12px">El Tinder de los Autos — Verificacion Vehicular</p></div>' +
    '<div style="padding:20px 24px;text-align:center;background:' + (esAprobado ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)') + '"><h2 style="color:' + (esAprobado ? '#34d399' : '#ef4444') + ';margin:0;font-size:18px">' + esc(statusText) + '</h2><p style="color:#d4af37;font-size:24px;font-weight:bold;margin:8px 0">' + esc(exp.folio) + '</p></div>' +
    '<div style="padding:20px 24px"><h3 style="color:white;font-size:16px;margin:0 0 12px">Vehiculo: ' + vehiculo + '</h3><p style="font-size:13px;margin:4px 0">NIV: <strong style="color:white;font-family:monospace">' + esc(exp.vin) + '</strong></p><p style="font-size:13px;margin:4px 0">Placas: <strong style="color:white">' + esc(exp.placas) + '</strong></p></div>' +
    '<div style="padding:0 24px 20px"><h3 style="color:#d4af37;font-size:14px;margin:0 0 8px">Puntos de Verificacion</h3><table style="width:100%">' + semaforoHtml + '</table></div>' +
    (exp.notas_verificador ? '<div style="padding:0 24px 20px"><h3 style="color:#d4af37;font-size:14px;margin:0 0 8px">Observaciones</h3><p style="font-size:13px;background:#0d2921;padding:12px;border-radius:8px">' + esc(exp.notas_verificador) + '</p></div>' : '') +
    '<div style="padding:20px 24px;text-align:center"><a href="' + certUrl + '" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#c9a961);color:#0a1f1a;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:14px">Ver Certificado Completo</a></div>' +
    '<div style="padding:16px 24px;font-size:9px;color:#5a7a6b;line-height:1.6;border-top:1px solid rgba(212,175,55,0.1)"><p>Este reporte es un servicio informativo de revision vehicular. Alabol Car Broker NO es una autoridad legal, pericial ni gubernamental. La informacion es obtenida por peritos especializados y tiene un margen de error inherente. No nos hacemos responsables por decisiones basadas en este reporte. Consulta nuestros <a href="' + SITE_URL + '/terminos.html" style="color:#d4af37">terminos y condiciones</a> y <a href="' + SITE_URL + '/aviso-privacidad.html" style="color:#d4af37">aviso de privacidad</a>.</p></div>' +
    '<div style="padding:12px 24px;text-align:center;font-size:11px;color:#6b8f7b"><p>Alabol Car Broker — El Tinder de los Autos</p><p>alabolcar.com.mx | WhatsApp: +52 55 6866 7571</p></div></div></body></html>';
}

function buildNuevaSolicitudEmail(exp) {
  var vehiculo = esc((exp.marca || '') + ' ' + (exp.modelo || '') + ' ' + (exp.anio || ''));
  var fecha = exp.created_at ? new Date(exp.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }) : 'N/A';
  var tierNombres = { basico: 'Escudo ($299)', verificado: 'Escudo Pro ($499)', plus: 'Escudo Total ($799)' };
  var tierLabel = tierNombres[exp.tier] || esc(exp.tier || 'N/A');
  var radarUrl = 'https://alabol.netlify.app/radar-interno.html';
  var peritoUrl = 'https://alabol.netlify.app/verificacion/verificar/';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#0a1f1a;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;background:#0a1f1a;color:#a8c5b8">' +
    '<div style="background:#0d2921;padding:24px;text-align:center;border-bottom:2px solid #d4af37"><h1 style="color:#d4af37;margin:0;font-size:22px">Alabol Car Broker</h1><p style="color:#a8c5b8;margin:4px 0 0;font-size:12px">Nueva Solicitud de Verificacion</p></div>' +
    '<div style="padding:24px;text-align:center;background:rgba(212,175,55,0.07)">' +
    '<p style="color:#d4af37;font-size:30px;font-weight:bold;margin:0 0 6px">' + esc(exp.folio) + '</p>' +
    '<h2 style="color:white;font-size:18px;margin:0">' + vehiculo + '</h2>' +
    '</div>' +
    '<div style="padding:20px 24px"><table style="width:100%;border-collapse:collapse">' +
    '<tr><td style="padding:7px 0;font-size:13px;color:#a8c5b8;border-bottom:1px solid rgba(212,175,55,0.1)">Solicitante</td><td style="padding:7px 0;font-size:13px;color:white;font-weight:bold;border-bottom:1px solid rgba(212,175,55,0.1)">' + esc(exp.nombre_solicitante || '') + '</td></tr>' +
    '<tr><td style="padding:7px 0;font-size:13px;color:#a8c5b8;border-bottom:1px solid rgba(212,175,55,0.1)">Email</td><td style="padding:7px 0;font-size:13px;color:white;border-bottom:1px solid rgba(212,175,55,0.1)">' + esc(exp.email_solicitante || '') + '</td></tr>' +
    '<tr><td style="padding:7px 0;font-size:13px;color:#a8c5b8;border-bottom:1px solid rgba(212,175,55,0.1)">WhatsApp</td><td style="padding:7px 0;font-size:13px;color:white;border-bottom:1px solid rgba(212,175,55,0.1)">' + esc(exp.telefono_solicitante || '') + '</td></tr>' +
    '<tr><td style="padding:7px 0;font-size:13px;color:#a8c5b8;border-bottom:1px solid rgba(212,175,55,0.1)">Tier</td><td style="padding:7px 0;font-size:13px;color:#d4af37;font-weight:bold;border-bottom:1px solid rgba(212,175,55,0.1)">' + tierLabel + '</td></tr>' +
    '<tr><td style="padding:7px 0;font-size:13px;color:#a8c5b8;border-bottom:1px solid rgba(212,175,55,0.1)">Monto</td><td style="padding:7px 0;font-size:13px;color:white;border-bottom:1px solid rgba(212,175,55,0.1)">$' + esc(String(exp.pago_monto || '')) + ' MXN</td></tr>' +
    '<tr><td style="padding:7px 0;font-size:13px;color:#a8c5b8">Fecha</td><td style="padding:7px 0;font-size:13px;color:white">' + fecha + '</td></tr>' +
    '</table></div>' +
    '<div style="padding:8px 24px 24px;display:flex;gap:12px;text-align:center">' +
    '<a href="' + radarUrl + '" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#c9a961);color:#0a1f1a;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:13px;margin-right:10px">Ver en Radar Interno</a>' +
    '<a href="' + peritoUrl + '" style="display:inline-block;background:#0d2921;border:1px solid #d4af37;color:#d4af37;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:13px">Abrir Panel Perito</a>' +
    '</div>' +
    '<div style="padding:16px 24px;font-size:10px;color:#5a7a6b;line-height:1.6;border-top:1px solid rgba(212,175,55,0.1);text-align:center"><p style="margin:0">Este es un aviso interno. El cliente ya recibio confirmacion.</p></div>' +
    '<div style="padding:12px 24px;text-align:center;font-size:11px;color:#6b8f7b"><p>Alabol Car Broker — El Tinder de los Autos</p><p>alabolcar.com.mx | WhatsApp: +52 55 6866 7571</p></div></div></body></html>';
}

function buildConfirmacionEmail(exp) {
  var vehiculo = esc((exp.marca || '') + ' ' + (exp.modelo || '') + ' ' + (exp.anio || ''));
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#0a1f1a;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;background:#0a1f1a;color:#a8c5b8">' +
    '<div style="background:#0d2921;padding:24px;text-align:center;border-bottom:2px solid #d4af37"><h1 style="color:#d4af37;margin:0;font-size:22px">Alabol Car Broker</h1><p style="color:#a8c5b8;margin:4px 0 0;font-size:12px">El Tinder de los Autos</p></div>' +
    '<div style="padding:24px;text-align:center"><h2 style="color:white;font-size:20px;margin:0 0 8px">Tu background check esta en camino</h2><p style="color:#d4af37;font-size:28px;font-weight:bold;margin:12px 0">' + esc(exp.folio) + '</p><p style="font-size:14px;line-height:1.6">Recibimos la solicitud para verificar tu <strong style="color:white">' + vehiculo + '</strong>. Te notificaremos cuando el dictamen este listo.</p></div>' +
    '<div style="padding:20px 24px;text-align:center"><a href="' + SITE_URL + '/certificado/' + esc(exp.folio) + '" style="display:inline-block;background:linear-gradient(135deg,#d4af37,#c9a961);color:#0a1f1a;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:14px">Consultar Estado</a></div>' +
    '<div style="padding:16px 24px;font-size:9px;color:#5a7a6b;line-height:1.6;border-top:1px solid rgba(212,175,55,0.1)"><p>Este reporte es un servicio informativo de revision vehicular. Alabol Car Broker NO es una autoridad legal, pericial ni gubernamental. La informacion es obtenida por peritos especializados y tiene un margen de error inherente. No nos hacemos responsables por decisiones basadas en este reporte. Consulta nuestros <a href="' + SITE_URL + '/terminos.html" style="color:#d4af37">terminos y condiciones</a> y <a href="' + SITE_URL + '/aviso-privacidad.html" style="color:#d4af37">aviso de privacidad</a>.</p></div>' +
    '<div style="padding:12px 24px;text-align:center;font-size:11px;color:#6b8f7b"><p>Alabol Car Broker — El Tinder de los Autos</p><p>alabolcar.com.mx | WhatsApp: +52 55 6866 7571</p></div></div></body></html>';
}
