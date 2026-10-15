const encoder = new TextEncoder();
async function signature(secret, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signed), b => b.toString(16).padStart(2, "0")).join("");
}
export async function onRequest(context) {
  const { request, env, next } = context;
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/") || path === "/api/login") return next();
  if (!env.BOARD_PIN || !/^\d{6}$/.test(env.BOARD_PIN) || !env.SESSION_SECRET) return Response.json({ error: "Authentication not configured" }, { status: 503 });
  const token = request.headers.get("Cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith("board_session="))?.slice(14);
  const [expiry, sig] = (token || "").split(".");
  if (!/^\d+$/.test(expiry || "") || Number(expiry) < Date.now() || !/^[a-f0-9]{64}$/.test(sig || "")) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const expected = await signature(env.SESSION_SECRET, expiry);
  if (sig !== expected) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return next();
}
