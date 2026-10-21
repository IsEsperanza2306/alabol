// OCR-DOCUMENT — Lectura de documentos vehiculares con Claude Vision (migrada de Netlify)
import { json, preflight, MODELO_CLAUDE } from '../_shared/comun.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const VALID_TYPES = ['tarjeta_circulacion', 'factura', 'niv_foto'];
const MAX_BASE64_LENGTH = 2_000_000;

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (!ANTHROPIC_API_KEY) return json(req, 500, { error: 'API key no configurada' });
  if (!req.headers.get('apikey') && !req.headers.get('authorization')) return json(req, 401, { error: 'No autorizado' });
  try {
    const body = await req.json().catch(() => ({}));
    let image = String(body.image ?? '');
    const docType = body.type || 'tarjeta_circulacion';
    if (!image) return json(req, 400, { error: 'Imagen requerida' });
    if (!VALID_TYPES.includes(docType)) return json(req, 400, { error: 'Tipo no valido' });
    if (image.includes('base64,')) image = image.split('base64,')[1];
    if (image.length > MAX_BASE64_LENGTH) return json(req, 400, { error: 'Imagen muy grande. Usa una foto de menor resolucion.' });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODELO_CLAUDE, max_tokens: 1024,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: prompt(docType) },
        ] }],
      }),
    });
    if (!res.ok) throw new Error('Claude API ' + res.status + ': ' + (await res.text()).slice(0, 200));
    const result = await res.json();
    const text = result?.content?.[0]?.text;
    if (!text) throw new Error('Respuesta vacia');
    try {
      const data = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      return json(req, 200, { success: true, type: docType, data });
    } catch {
      return json(req, 200, { success: false, error: 'No se pudo leer el documento. Asegurate de que la foto sea clara.' });
    }
  } catch (err) {
    return json(req, 500, { error: (err as Error).message || 'Error interno' });
  }
});

function prompt(type: string): string {
  if (type === 'tarjeta_circulacion') return 'Esta es una foto de una tarjeta de circulacion vehicular de Mexico.\nExtrae TODOS los datos que puedas leer. RESPONDE SOLO EN JSON (sin markdown, sin backticks):\n{"vin":"17 caracteres o null","marca":"o null","modelo":"o null","anio":numero o null,"color":"o null","placas":"o null","estado":"o null","nombre_titular":"nombre del propietario o null","numero_motor":"o null","tipo_vehiculo":"sedan/suv/pickup/etc o null","legible":true/false,"confianza":"alta/media/baja","notas":"observaciones o null"}';
  if (type === 'factura') return 'Esta es una foto de una factura vehicular o carta factura de Mexico.\nExtrae los datos. RESPONDE SOLO EN JSON (sin markdown):\n{"vin":"o null","marca":"o null","modelo":"o null","anio":numero o null,"nombre_titular":"comprador o null","valor_factura":numero o null,"fecha_factura":"o null","color":"o null","es_carta_factura":true/false,"endosos":numero o 0,"legible":true/false,"confianza":"alta/media/baja","notas":"o null"}';
  if (type === 'niv_foto') return 'Esta es una foto del NIV/VIN grabado en un vehiculo.\nLee el numero. RESPONDE SOLO EN JSON (sin markdown):\n{"vin":"17 caracteres o null","legible":true/false,"ubicacion":"tablero/chasis/puerta/otro","indicios_remarcado":true/false,"remarcado_detalle":"o null","confianza":"alta/media/baja"}';
  return 'Analiza esta imagen de un documento vehicular mexicano y extrae datos visibles en formato JSON.';
}
