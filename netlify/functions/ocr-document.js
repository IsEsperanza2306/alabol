// =============================================
// OCR-DOCUMENT — Lectura de documentos con Claude Vision
// Netlify Function — Alabol Car Broker
// Extrae datos de tarjeta de circulación, factura, NIV, etc.
// =============================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada' }) };
  }

  try {
    var body = JSON.parse(event.body || '{}');
    var imageBase64 = body.image; // base64 sin el prefijo data:image/...
    var docType = body.type || 'tarjeta_circulacion'; // tarjeta_circulacion | factura | niv_foto

    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Imagen requerida' }) };
    }

    // Limpiar prefijo base64 si viene
    if (imageBase64.indexOf('base64,') !== -1) {
      imageBase64 = imageBase64.split('base64,')[1];
    }

    var prompt = getPromptForDocType(docType);

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
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 }
            },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!res.ok) {
      var errText = await res.text();
      throw new Error('Claude API ' + res.status + ': ' + errText.substring(0, 300));
    }

    var result = await res.json();
    var textContent = result.content && result.content[0] && result.content[0].text;
    if (!textContent) throw new Error('Respuesta vacia de Claude');

    // Parse JSON
    var jsonStr = textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    var extracted;
    try {
      extracted = JSON.parse(jsonStr);
    } catch (e) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'No se pudo leer el documento. Asegurate de que la foto sea clara y sin reflejos.', raw: textContent.substring(0, 300) })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, type: docType, data: extracted })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Error interno' })
    };
  }
};

function getPromptForDocType(type) {
  if (type === 'tarjeta_circulacion') {
    return 'Esta es una foto de una tarjeta de circulacion vehicular de Mexico.\n\n' +
      'Extrae TODOS los datos que puedas leer. RESPONDE SOLO EN JSON (sin markdown, sin backticks, sin explicaciones):\n' +
      '{\n' +
      '  "vin": "el NIV/VIN de 17 caracteres o null si no es legible",\n' +
      '  "marca": "marca del vehiculo o null",\n' +
      '  "modelo": "modelo o null",\n' +
      '  "anio": numero del año o null,\n' +
      '  "color": "color o null",\n' +
      '  "placas": "numero de placas o null",\n' +
      '  "estado": "estado de registro o null",\n' +
      '  "nombre_titular": "nombre del propietario que aparece en el documento o null",\n' +
      '  "numero_motor": "numero de motor o null",\n' +
      '  "tipo_vehiculo": "sedan/suv/pickup/etc o null",\n' +
      '  "cilindros": "numero de cilindros o null",\n' +
      '  "uso": "particular/publico/etc o null",\n' +
      '  "vigencia": "fecha de vigencia o null",\n' +
      '  "legible": true/false,\n' +
      '  "confianza": "alta/media/baja",\n' +
      '  "notas": "cualquier observacion relevante o null"\n' +
      '}';
  }

  if (type === 'factura') {
    return 'Esta es una foto de una factura vehicular o carta factura de Mexico.\n\n' +
      'Extrae los datos que puedas leer. RESPONDE SOLO EN JSON (sin markdown, sin backticks):\n' +
      '{\n' +
      '  "vin": "NIV/VIN o null",\n' +
      '  "marca": "marca o null",\n' +
      '  "modelo": "modelo o null",\n' +
      '  "anio": año o null,\n' +
      '  "nombre_titular": "nombre del comprador/propietario o null",\n' +
      '  "rfc_titular": "RFC o null",\n' +
      '  "valor_factura": numero sin formato o null,\n' +
      '  "fecha_factura": "fecha o null",\n' +
      '  "numero_motor": "numero de motor o null",\n' +
      '  "color": "color o null",\n' +
      '  "es_carta_factura": true/false,\n' +
      '  "endosos": numero de endosos visibles o 0,\n' +
      '  "legible": true/false,\n' +
      '  "confianza": "alta/media/baja",\n' +
      '  "notas": "observaciones o null"\n' +
      '}';
  }

  if (type === 'niv_foto') {
    return 'Esta es una foto del NIV/VIN grabado en un vehiculo (tablero o chasis).\n\n' +
      'Lee el numero. RESPONDE SOLO EN JSON (sin markdown, sin backticks):\n' +
      '{\n' +
      '  "vin": "los 17 caracteres que lees o null",\n' +
      '  "legible": true/false,\n' +
      '  "ubicacion": "tablero/chasis/puerta/otro",\n' +
      '  "indicios_remarcado": true/false,\n' +
      '  "remarcado_detalle": "descripcion si hay indicios o null",\n' +
      '  "confianza": "alta/media/baja"\n' +
      '}';
  }

  // Default
  return 'Analiza esta imagen de un documento vehicular mexicano y extrae todos los datos visibles en formato JSON.';
}
