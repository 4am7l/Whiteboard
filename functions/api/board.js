export async function onRequestGet({ env }) {
  if (!env.DB) return Response.json({ error: "D1 binding DB missing" }, { status: 503 });
  try {
    const result = await env.DB.prepare("SELECT data FROM board_elements WHERE board_id = ?").bind("shared").all();
    return Response.json({ elements: result.results.map(row => JSON.parse(row.data)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: "Database table unavailable" }, { status: 503 }); }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return Response.json({ error: "D1 binding DB missing" }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!Array.isArray(body.elements) || body.elements.length > 200 || JSON.stringify(body).length > 400000) {
    return Response.json({ error: "Invalid or oversized payload" }, { status: 400 });
  }
  const statements = [];
  for (const element of body.elements) {
    if (!element || typeof element.id !== "string" || element.id.length > 128 || !Number.isInteger(element.version) || element.version < 1) {
      return Response.json({ error: "Invalid element" }, { status: 400 });
    }
    statements.push(env.DB.prepare(`INSERT INTO board_elements (board_id, element_id, version, data)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(board_id, element_id) DO UPDATE SET version = excluded.version, data = excluded.data
      WHERE excluded.version > board_elements.version`).bind("shared", element.id, element.version, JSON.stringify(element)));
  }
  try { if (statements.length) await env.DB.batch(statements); return Response.json({ ok: true }); }
  catch { return Response.json({ error: "Database write failed" }, { status: 503 }); }
}
