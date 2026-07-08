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
  `);

  db.exec(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('w_effort','0.5'), ('w_cost','0.5');
  `);
}
