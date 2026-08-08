export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ready'
        CHECK (status IN ('researching','ready','in_progress','done','research_failed')),
      priority TEXT NOT NULL DEFAULT 'slightly_desired'
        CHECK (priority IN ('urgent_fix','highly_desired','slightly_desired','dreams')),
      effort_level TEXT CHECK (effort_level IN ('Low','Medium','High')),
      effort_hours REAL,
      skill_level TEXT CHECK (skill_level IN ('Beginner','Intermediate','Advanced')),
      research_summary TEXT,
      research_error TEXT,
      researched_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('tool','material')),
      quantity INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS project_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('tool','material')),
      est_cost REAL,
      source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','research')),
      inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS guides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      summary TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS execution_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','research')),
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  ensureColumn(db, 'projects', 'research_error', 'TEXT');
  ensureColumn(db, 'projects', 'research_provider', 'TEXT');
  ensureColumn(db, 'project_items', 'source', "TEXT NOT NULL DEFAULT 'manual'");
  ensureColumn(db, 'project_items', 'match_override', "TEXT NOT NULL DEFAULT 'auto'");

  db.exec(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('w_effort','0.5'), ('w_cost','0.5');
  `);
}

function ensureColumn(db, table, column, definition) {
  const exists = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
