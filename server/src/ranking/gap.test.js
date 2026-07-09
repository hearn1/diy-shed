import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db/index.js';
import { analyzeGap, analyzeProjectGap } from './gap.js';

function tool(name, extra = {}) {
  return { id: 1, name, normalized_name: name.toLowerCase(), type: 'tool', est_cost: null, inventory_id: null, ...extra };
}
function material(name, extra = {}) {
  return { id: 1, name, normalized_name: name.toLowerCase(), type: 'material', est_cost: null, inventory_id: null, ...extra };
}
function inv(name, type, extra = {}) {
  return { id: 100, name, normalized_name: name.toLowerCase(), type, ...extra };
}

describe('analyzeGap', () => {
  it('marks an item owned when name + type match inventory and excludes it from cost', () => {
    const items = [tool('Hammer', { id: 1, est_cost: 20 })];
    const { items: analyzed, missing, missing_count, est_cost } = analyzeGap(items, [inv('hammer', 'tool', { id: 7 })]);
    expect(analyzed[0].owned).toBe(true);
    expect(analyzed[0].matched_inventory_id).toBe(7);
    expect(missing).toHaveLength(0);
    expect(missing_count).toBe(0);
    expect(est_cost).toBe(0);
  });

  it('marks an item owned when it has an explicit inventory_id regardless of name', () => {
    const items = [tool('Anything', { id: 1, inventory_id: 42, est_cost: 15 })];
    const { items: analyzed, missing } = analyzeGap(items, []);
    expect(analyzed[0].owned).toBe(true);
    expect(analyzed[0].matched_inventory_id).toBe(42);
    expect(missing).toHaveLength(0);
  });

  it('does not match when the name is equal but the type differs', () => {
    const items = [tool('Wrench', { id: 1 })];
    const { items: analyzed, missing_count } = analyzeGap(items, [inv('wrench', 'material', { id: 9 })]);
    expect(analyzed[0].owned).toBe(false);
    expect(analyzed[0].matched_inventory_id).toBe(null);
    expect(missing_count).toBe(1);
  });

  it('counts a missing item with null cost but adds $0 to est_cost', () => {
    const items = [material('Screws', { id: 1, est_cost: null }), material('Paint', { id: 2, est_cost: 30 })];
    const { missing_count, est_cost } = analyzeGap(items, []);
    expect(missing_count).toBe(2);
    expect(est_cost).toBe(30);
  });

  it('sums only missing item costs; owned items never contribute', () => {
    const items = [
      tool('Saw', { id: 1, est_cost: 100 }),
      tool('Drill', { id: 2, est_cost: 60 }),
      material('Lumber', { id: 3, est_cost: 40 })
    ];
    const inventory = [inv('saw', 'tool', { id: 1 })];
    const { est_cost, missing_count } = analyzeGap(items, inventory);
    expect(missing_count).toBe(2);
    expect(est_cost).toBe(100);
  });
});

describe('analyzeProjectGap', () => {
  let db;
  let dbPath;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `diy-shed-gap-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

  it('loads a project\'s items and inventory and delegates to analyzeGap', () => {
    const projectId = db.prepare('INSERT INTO projects (name) VALUES (?)').run('Shed').lastInsertRowid;
    db.prepare(
      'INSERT INTO project_items (project_id, name, normalized_name, type, est_cost) VALUES (?,?,?,?,?)'
    ).run(projectId, 'Circular Saw', 'circular saw', 'tool', 120);
    db.prepare(
      'INSERT INTO project_items (project_id, name, normalized_name, type, est_cost) VALUES (?,?,?,?,?)'
    ).run(projectId, 'Plywood', 'plywood', 'material', 40);
    db.prepare('INSERT INTO inventory (name, normalized_name, type) VALUES (?,?,?)').run('Circular Saw', 'circular saw', 'tool');

    const gap = analyzeProjectGap(projectId, db);
    expect(gap.missing_count).toBe(1);
    expect(gap.est_cost).toBe(40);
    const saw = gap.items.find((i) => i.name === 'Circular Saw');
    expect(saw.owned).toBe(true);
  });
});
