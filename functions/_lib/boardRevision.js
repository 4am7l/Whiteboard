// Additive migration; triggers also track writes from older clients.
const ready = new WeakMap();
export function ensureRevisions(db) {
  if (!ready.has(db)) ready.set(db, db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS board_revision_clock (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL)'),
    db.prepare('INSERT OR IGNORE INTO board_revision_clock(id, revision) VALUES(1, 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS board_element_revisions (board_id TEXT NOT NULL, element_id TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(board_id, element_id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS board_revision_lookup ON board_element_revisions(board_id, revision)'),
    ...['INSERT', 'UPDATE'].map(event => db.prepare(`CREATE TRIGGER IF NOT EXISTS board_revision_${event.toLowerCase()} AFTER ${event} ON board_elements BEGIN
      UPDATE board_revision_clock SET revision = revision + 1 WHERE id = 1;
      INSERT INTO board_element_revisions(board_id, element_id, revision)
      VALUES(NEW.board_id, NEW.element_id, (SELECT revision FROM board_revision_clock WHERE id=1))
      ON CONFLICT(board_id, element_id) DO UPDATE SET revision=excluded.revision;
    END`)),
  ]).catch(error => { ready.delete(db); throw error; }));
  return ready.get(db);
}
