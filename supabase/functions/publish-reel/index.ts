// PUBLISH-REEL — Publica un reel en Instagram vía Meta Graph API (migrada de Netlify). Solo admin.
import { json, preflight, rolDe } from '../_shared/comun.ts';

const ACCOUNT_ID = Deno.env.get('INSTAGRAM_ACCOUNT_ID') ?? '';
const TOKEN = Deno.env.get('META_ACCESS_TOKEN') ?? '';
const API = 'https://graph.facebook.com/v19.0';

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  const rol = await rolDe(req);
  if (!rol.admin) return json(req, 401, { error: 'Solo administradores pueden publicar' });
  const body = await req.json().catch(() => null);
  if (!body) return json(req, 400, { error: 'JSON inválido' });
  const { video_url, copy_text, reel_id } = body;
  if (!video_url || !copy_text) return json(req, 400, { error: 'Faltan video_url o copy_text' });
  if (!ACCOUNT_ID || !TOKEN) return json(req, 503, { error: 'Meta Graph API no configurada: faltan INSTAGRAM_ACCOUNT_ID y META_ACCESS_TOKEN en los secretos de Supabase.', reel_id });
  try {
    const container = await (await fetch(`${API}/${ACCOUNT_ID}/media`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: 'REELS', video_url, caption: copy_text, share_to_feed: true, access_token: TOKEN }),
    })).json();
    if (container.error) throw new Error(container.error.message);
    await new Promise((r) => setTimeout(r, 8000));
    const published = await (await fetch(`${API}/${ACCOUNT_ID}/media_publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: container.id, access_token: TOKEN }),
    })).json();
    if (published.error) throw new Error(published.error.message);
    return json(req, 200, { success: true, post_id: published.id });
  } catch (err) {
    return json(req, 500, { error: (err as Error).message });
  }
});
