import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db/index.js';

let dbPath;
let db;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `diy-shed-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = openDb(dbPath);
});

afterEach(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      // ignore
    }
  }
});

describe('schema', () => {
  it('creates all 6 tables', () => {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name);
    for (const t of ['projects', 'inventory', 'project_items', 'guides', 'settings', 'project_steps']) {
      expect(rows).toContain(t);
    }
  });

  it('applies defaults on a minimal project insert', () => {
    const info = db.prepare('INSERT INTO projects (name) VALUES (?)').run('Test');
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
    expect(row.status).toBe('ready');
    expect(row.priority).toBe('slightly_desired');
    expect(row.created_at).toBeTruthy();
  });

  it('cascades project delete to guides, project_items and project_steps', () => {
    const p = db.prepare('INSERT INTO projects (name) VALUES (?)').run('P').lastInsertRowid;
    db.prepare('INSERT INTO guides (project_id, title, url) VALUES (?,?,?)').run(p, 'G', 'http://x');
    db.prepare('INSERT INTO project_items (project_id, name, normalized_name, type) VALUES (?,?,?,?)').run(
      p,
      'Drill',
      'drill',
      'tool'
    );
    db.prepare('INSERT INTO project_steps (project_id, text, position) VALUES (?,?,?)').run(p, 'Cut boards', 0);
    db.prepare('DELETE FROM projects WHERE id = ?').run(p);
    expect(db.prepare('SELECT COUNT(*) c FROM guides WHERE project_id = ?').get(p).c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) c FROM project_items WHERE project_id = ?').get(p).c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) c FROM project_steps WHERE project_id = ?').get(p).c).toBe(0);
  });

  it('applies defaults on a minimal project_steps insert', () => {
    const p = db.prepare('INSERT INTO projects (name) VALUES (?)').run('P').lastInsertRowid;
    const info = db.prepare('INSERT INTO project_steps (project_id, text, position) VALUES (?,?,?)').run(p, 'Do it', 0);
    const row = db.prepare('SELECT * FROM project_steps WHERE id = ?').get(info.lastInsertRowid);
    expect(row.done).toBe(0);
    expect(row.source).toBe('manual');
  });

  it('nulls project_items.inventory_id when inventory is deleted', () => {
    const p = db.prepare('INSERT INTO projects (name) VALUES (?)').run('P').lastInsertRowid;
    const inv = db
      .prepare('INSERT INTO inventory (name, normalized_name, type) VALUES (?,?,?)')
      .run('Drill', 'drill', 'tool').lastInsertRowid;
    const item = db
      .prepare('INSERT INTO project_items (project_id, name, normalized_name, type, inventory_id) VALUES (?,?,?,?,?)')
      .run(p, 'Drill', 'drill', 'tool', inv).lastInsertRowid;
    db.prepare('DELETE FROM inventory WHERE id = ?').run(inv);
    const row = db.prepare('SELECT inventory_id FROM project_items WHERE id = ?').get(item);
    expect(row.inventory_id).toBeNull();
  });

  it('is idempotent and seeds settings once', () => {
    openDb(dbPath).close();
    const w = db.prepare('SELECT value FROM settings WHERE key = ?').get('w_effort');
    const c = db.prepare('SELECT value FROM settings WHERE key = ?').get('w_cost');
    expect(w.value).toBe('0.5');
    expect(c.value).toBe('0.5');
    expect(db.prepare('SELECT COUNT(*) c FROM settings').get().c).toBe(2);
  });
});
