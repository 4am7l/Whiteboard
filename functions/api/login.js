const encoder = new TextEncoder();
export async function onRequestPost({ request, env }) {
  if (!env.BOARD_PIN || !/^\d{6}$/.test(env.BOARD_PIN) || !env.SESSION_SECRET) return Response.json({ error: "Authentication not configured" }, { status: 503 });
  let input;
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  if (typeof input.pin !== "string" || !/^\d{6}$/.test(input.pin) || input.pin !== env.BOARD_PIN) return Response.json({ error: "Wrong code" }, { status: 401 });
  const expiry = String(Date.now() + 7 * 86400000);
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(expiry));
  const sig = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
  return Response.json({ ok: true }, { headers: { "Set-Cookie": `board_session=${expiry}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`, "Cache-Control": "no-store" } });
}
