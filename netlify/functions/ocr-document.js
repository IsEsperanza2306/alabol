// =============================================
// OCR-DOCUMENT — Lectura de documentos con Claude Vision
// Netlify Function — Alabol Car Broker
// =============================================

var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
var INTERNAL_SECRET = process.env.INTERNAL_SECRET;
var VALID_TYPES = ['tarjeta_circulacion', 'factura', 'niv_foto'];
var MAX_BASE64_LENGTH = 2000000; // ~1.5MB imagen

function checkAuth(event) {
  var secret = event.headers['x-internal-key'] || '';
  if (INTERNAL_SECRET && secret === INTERNAL_SECRET) return true;
  var authHeader = event.headers['authorization'] || '';
  if (authHeader) return true;
  return false;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  if (!ANTHROPIC_API_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'API key no configurada' }) };
  if (!checkAuth(event)) return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado' }) };

  try {
    var body = JSON.parse(event.body || '{}');
    var imageBase64 = body.image;
    var docType = body.type || 'tarjeta_circulacion';

    if (!imageBase64) return { statusCode: 400, body: JSON.stringify({ error: 'Imagen requerida' }) };
    if (VALID_TYPES.indexOf(docType) === -1) return { statusCode: 400, body: JSON.stringify({ error: 'Tipo no valido' }) };

    // Clean base64 prefix
    if (imageBase64.indexOf('base64,') !== -1) imageBase64 = imageBase64.split('base64,')[1];

    // Size check
    if (imageBase64.length > MAX_BASE64_LENGTH) return { statusCode: 400, body: JSON.stringify({ error: 'Imagen muy grande. Usa una foto de menor resolucion.' }) };

    var prompt = getPromptForDocType(docType);

    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1024,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });

    if (!res.ok) throw new Error('Claude API ' + res.status + ': ' + (await res.text()).substring(0, 200));
    var result = await res.json();
    var textContent = result.content && result.content[0] && result.content[0].text;
    if (!textContent) throw new Error('Respuesta vacia');

    var jsonStr = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    var extracted;
    try { extracted = JSON.parse(jsonStr); }
    catch (e) { return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: false, error: 'No se pudo leer el documento. Asegurate de que la foto sea clara.' }) }; }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, type: docType, data: extracted }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Error interno' }) };
  }
};

function getPromptForDocType(type) {
  if (type === 'tarjeta_circulacion') {
    return 'Esta es una foto de una tarjeta de circulacion vehicular de Mexico.\nExtrae TODOS los datos que puedas leer. RESPONDE SOLO EN JSON (sin markdown, sin backticks):\n{"vin":"17 caracteres o null","marca":"o null","modelo":"o null","anio":numero o null,"color":"o null","placas":"o null","estado":"o null","nombre_titular":"nombre del propietario o null","numero_motor":"o null","tipo_vehiculo":"sedan/suv/pickup/etc o null","legible":true/false,"confianza":"alta/media/baja","notas":"observaciones o null"}';
  }
  if (type === 'factura') {
    return 'Esta es una foto de una factura vehicular o carta factura de Mexico.\nExtrae los datos. RESPONDE SOLO EN JSON (sin markdown):\n{"vin":"o null","marca":"o null","modelo":"o null","anio":numero o null,"nombre_titular":"comprador o null","valor_factura":numero o null,"fecha_factura":"o null","color":"o null","es_carta_factura":true/false,"endosos":numero o 0,"legible":true/false,"confianza":"alta/media/baja","notas":"o null"}';
  }
  if (type === 'niv_foto') {
    return 'Esta es una foto del NIV/VIN grabado en un vehiculo.\nLee el numero. RESPONDE SOLO EN JSON (sin markdown):\n{"vin":"17 caracteres o null","legible":true/false,"ubicacion":"tablero/chasis/puerta/otro","indicios_remarcado":true/false,"remarcado_detalle":"o null","confianza":"alta/media/baja"}';
  }
  return 'Analiza esta imagen de un documento vehicular mexicano y extrae datos visibles en formato JSON.';
}
