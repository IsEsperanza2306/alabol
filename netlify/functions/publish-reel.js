/**
 * publish-reel.js — Publica un reel en Instagram vía Meta Graph API
 *
 * Requiere en Netlify env vars:
 *   INSTAGRAM_ACCOUNT_ID  — ID de la cuenta Business de Instagram
 *   META_ACCESS_TOKEN     — Token de acceso de larga duración (Meta Graph API)
 */

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON inválido" }) };
  }

  const { video_url, copy_text, reel_id } = body;

  if (!video_url || !copy_text) {
    return { statusCode: 400, body: JSON.stringify({ error: "Faltan video_url o copy_text" }) };
  }

  const ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID;
  const TOKEN = process.env.META_ACCESS_TOKEN;

  if (!ACCOUNT_ID || !TOKEN) {
    return {
      statusCode: 503,
      body: JSON.stringify({
        error: "Meta Graph API no configurada. Agrega INSTAGRAM_ACCOUNT_ID y META_ACCESS_TOKEN en Netlify → Site settings → Environment variables.",
        reel_id,
      }),
    };
  }

  const API = "https://graph.facebook.com/v19.0";

  try {
    // Paso 1: Crear container de media (Reel)
    const containerRes = await fetch(`${API}/${ACCOUNT_ID}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "REELS",
        video_url,
        caption: copy_text,
        share_to_feed: true,
        access_token: TOKEN,
      }),
    });
    const container = await containerRes.json();
    if (container.error) throw new Error(container.error.message);

    // Paso 2: Esperar a que el container procese (Meta lo necesita)
    await new Promise(r => setTimeout(r, 8000));

    // Paso 3: Publicar
    const publishRes = await fetch(`${API}/${ACCOUNT_ID}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: container.id,
        access_token: TOKEN,
      }),
    });
    const published = await publishRes.json();
    if (published.error) throw new Error(published.error.message);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, post_id: published.id }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
