// Authentication is performed by the shared API middleware.
export function onRequestGet() {
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
