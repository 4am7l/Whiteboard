export async function onRequestPost() {
  return Response.json({ ok: true }, {
    headers: {
      "Set-Cookie": "board_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      "Cache-Control": "no-store"
    }
  });
}
