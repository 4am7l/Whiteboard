CREATE TABLE IF NOT EXISTS board_elements (
  board_id TEXT NOT NULL,
  element_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (board_id, element_id)
);
