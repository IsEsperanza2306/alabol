// EMITIR-DICTAMEN — Cierra una verificación con su resultado (migrada de Netlify).
// Antes era pública; ahora requiere sesión de verificador o admin.
import { json, preflight, rolDe, sbSelect, sbPatch, limpiarFolio, SB_URL, SB_KEY } from '../_shared/comun.ts';

const RESULTADOS = ['aprobado', 'aprobado_con_observaciones', 'no_aprobado'];
const CLAVES = ['documentos_completos', 'vin_valido', 'vin_no_remarcado', 'placas_vigentes', 'sin_reporte_robo', 'factura_original',
  'tarjeta_circulacion', 'chip_repuve', 'numero_motor', 'condicion_exterior', 'pintura_original', 'estructura_integra'];
const VALORES = ['verde', 'amarillo', 'rojo'];

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  const rol = await rolDe(req);
  if (!rol.verificador) return json(req, 401, { error: 'Inicia sesión como verificador para emitir el dictamen' });
  const body = await req.json().catch(() => null);
  if (!body) return json(req, 400, { error: 'JSON inválido' });

  const folio = limpiarFolio(body.folio, 20, true);
  const semaforo = body.semaforo && typeof body.semaforo === 'object' ? body.semaforo : {};
  const notas = String(body.notas || '').slice(0, 2000);
  const resultado = body.resultado;
  if (!folio) return json(req, 400, { error: 'Folio requerido' });
  if (!RESULTADOS.includes(resultado)) return json(req, 400, { error: 'Resultado inválido. Debe ser: ' + RESULTADOS.join(', ') });
  const limpio: Record<string, string> = {};
  for (const k of CLAVES) if (VALORES.includes(semaforo[k])) limpio[k] = semaforo[k];

  try {
    const rows = await sbSelect('verificaciones', 'folio=eq.' + encodeURIComponent(folio) + '&limit=1');
    if (!rows.length) return json(req, 404, { error: 'Verificación no encontrada: ' + folio });
    const exp = rows[0];
    if (exp.resultado_final) return json(req, 409, { error: 'Este expediente ya tiene un dictamen emitido', resultado_existente: exp.resultado_final });
    if (!['pagado', 'en_revision', 'pendiente_pago'].includes(exp.estatus)) return json(req, 409, { error: 'El expediente tiene estatus "' + exp.estatus + '" y no puede recibir dictamen' });

    const ahora = new Date().toISOString();
    await sbPatch('verificaciones', 'folio=eq.' + encodeURIComponent(folio), {
      semaforo: limpio, notas_verificador: notas, resultado_final: resultado,
      estatus: resultado === 'no_aprobado' ? 'rechazado' : resultado,
      aprobado_at: ahora, vigencia_certificado: new Date(Date.now() + 30 * 864e5).toISOString(),
    });

    // Aviso al cliente sin bloquear la respuesta
    const aviso = fetch(`${SB_URL}/functions/v1/send-notification`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SB_KEY, apikey: SB_KEY },
      body: JSON.stringify({ folio, tipo: 'dictamen' }),
    }).catch(() => null);
    // @ts-ignore EdgeRuntime existe en Supabase
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(aviso);

    return json(req, 200, { success: true, resultado, folio });
  } catch (err) {
    return json(req, 500, { error: (err as Error).message || 'Error interno al emitir dictamen' });
  }
});
