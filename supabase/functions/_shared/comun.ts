// Utilidades compartidas de las Edge Functions de Alabol
export const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
export const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
export const SITE_URL = 'https://alabolcar.com.mx';

const ORIGENES = ['https://alabolcar.com.mx', 'https://www.alabolcar.com.mx'];

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origin) ? origin : ORIGENES[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' });
  return null;
}

function sbHeaders(extra: Record<string, string> = {}) {
  return { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Accept: 'application/json', ...extra };
}

// deno-lint-ignore no-explicit-any
export async function sbSelect(table: string, query: string): Promise<any[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error('DB read error: ' + r.status);
  return r.json();
}

export async function sbPatch(table: string, query: string, data: unknown): Promise<void> {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, { method: 'PATCH', headers: sbHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify(data) });
  if (!r.ok) throw new Error('DB update error ' + r.status + ': ' + (await r.text()).slice(0, 300));
}

export async function sbDownload(bucket: string, path: string): Promise<Uint8Array | null> {
  const r = await fetch(`${SB_URL}/storage/v1/object/${bucket}/${path}`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  if (!r.ok) return null;
  return new Uint8Array(await r.arrayBuffer());
}

export type Rol = { uid: string | null; admin: boolean; verificador: boolean; interno: boolean };
const NADIE: Rol = { uid: null, admin: false, verificador: false, interno: false };

// Lee quién llama: llamada interna (service role), usuario con sesión o anónimo
export async function rolDe(req: Request): Promise<Rol> {
  const tok = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!tok) return NADIE;
  if (SB_KEY && tok === SB_KEY) return { uid: null, admin: true, verificador: true, interno: true };
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + tok } });
  if (!r.ok) return NADIE;
  const u = await r.json();
  if (!u?.id) return NADIE;
  const [p, v] = await Promise.all([
    sbSelect('perfiles', `id=eq.${u.id}&select=rol,activo`),
    sbSelect('verificadores', `user_id=eq.${u.id}&activo=eq.true&select=id`),
  ]);
  const admin = p[0]?.rol === 'admin' && p[0]?.activo !== false;
  return { uid: u.id, admin, verificador: admin || v.length > 0, interno: false };
}

export function limpiarFolio(f: unknown, max = 20, mayus = false): string {
  const s = String(f ?? '').replace(/[^A-Z0-9-]/gi, '').slice(0, max);
  return mayus ? s.toUpperCase() : s;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export const MODELO_CLAUDE = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5';
