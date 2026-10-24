CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS setup (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  beans_name TEXT NOT NULL,
  variety TEXT NOT NULL DEFAULT '',
  process TEXT NOT NULL DEFAULT '',
  roast_level TEXT NOT NULL DEFAULT '',
  roast_date TEXT NOT NULL DEFAULT '',
  descriptors TEXT NOT NULL DEFAULT '',
  brewer TEXT NOT NULL DEFAULT '',
  filter_type TEXT NOT NULL DEFAULT '',
  grinder TEXT NOT NULL DEFAULT '',
  kettle TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  change_note TEXT NOT NULL DEFAULT '',
  change_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brewed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  coffee_g REAL NOT NULL,
  water_g REAL NOT NULL,
  grind REAL NOT NULL,
  grind_style TEXT NOT NULL,
  temp_c REAL NOT NULL,
  temp_end_c REAL,
  pours INTEGER NOT NULL,
  pour_plan TEXT NOT NULL DEFAULT '',
  agitation TEXT NOT NULL DEFAULT '',
  tbt_seconds INTEGER NOT NULL,
  rest_minutes INTEGER,
  feedback_json TEXT NOT NULL,
  feedback_notes TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'user'
);

CREATE INDEX IF NOT EXISTS idx_brews_when ON brews (brewed_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  model TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload TEXT NOT NULL
);
