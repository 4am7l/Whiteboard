import { ensureRevisions } from '../_lib/boardRevision.js';
export async function onRequestGet({ request, env }) {
  if (!env.DB) return Response.json({ error: 'D1 binding DB missing' }, { status: 503 });
  try {
    await ensureRevisions(env.DB);
    const raw = new URL(request.url).searchParams.get('since');
    const since = raw !== null && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : -1;
    const [clock, rows] = await env.DB.batch([
      env.DB.prepare('SELECT revision FROM board_revision_clock WHERE id=1'),
      since < 0
        ? env.DB.prepare('SELECT data FROM board_elements WHERE board_id=?').bind('shared')
        : env.DB.prepare(`SELECT e.data FROM board_element_revisions r
            JOIN board_elements e ON e.board_id=r.board_id AND e.element_id=r.element_id
            WHERE r.board_id=? AND r.revision > ?
            UNION ALL SELECT data FROM board_elements WHERE board_id=? AND ? > (SELECT revision FROM board_revision_clock WHERE id=1)`)
            .bind('shared', since, 'shared', since),
    ]);
    const cursor = clock.results[0].revision;
    return Response.json({ elements: rows.results.map(row => JSON.parse(row.data)), cursor, full: since < 0 || since > cursor }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Database table unavailable' }, { status: 503 }); }
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return Response.json({ error: 'D1 binding DB missing' }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!Array.isArray(body?.elements) || body.elements.length > 2000 || new TextEncoder().encode(JSON.stringify(body)).length > 20000000) return Response.json({ error: 'Invalid or oversized payload' }, { status: 400 });
  const seen = new Set();
  for (const e of body.elements) {
    if (!e || typeof e.id !== 'string' || !e.id.length || e.id.length > 128 || !Number.isSafeInteger(e.version) || e.version < 1 || !Number.isInteger(e.versionNonce) || seen.has(e.id)) return Response.json({ error: 'Invalid element' }, { status: 400 });
    seen.add(e.id);
  }
  try {
    await ensureRevisions(env.DB);
    const statements = body.elements.flatMap(e => [
      env.DB.prepare(`INSERT INTO board_elements(board_id,element_id,version,data) VALUES(?,?,?,?)
        ON CONFLICT(board_id,element_id) DO UPDATE SET version=excluded.version,data=excluded.data
        WHERE excluded.version > board_elements.version`).bind('shared', e.id, e.version, JSON.stringify(e)),
      env.DB.prepare('SELECT data FROM board_elements WHERE board_id=? AND element_id=?').bind('shared', e.id),
    ]);
    const results = statements.length ? await env.DB.batch(statements) : [];
    const accepted = [], conflicts = [];
    body.elements.forEach((e, index) => {
      const current = JSON.parse(results[index * 2 + 1].results[0].data);
      if (current.version === e.version && current.versionNonce === e.versionNonce) accepted.push({ id: e.id, version: e.version, versionNonce: e.versionNonce });
      else conflicts.push(current);
    });
    return Response.json({ ok: true, accepted, conflicts });
  } catch { return Response.json({ error: 'Database write failed' }, { status: 503 }); }
}
