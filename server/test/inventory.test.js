import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

const dbPath = path.join(os.tmpdir(), `diy-shed-inventory-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.DIYSHED_DB = dbPath;

let app;
let db;

beforeAll(async () => {
  app = (await import('../src/app.js')).default;
  db = (await import('../src/db/index.js')).default;
});

afterAll(() => {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      // ignore
    }
  }
});

describe('inventory API', () => {
  it('runs CRUD and normalizes the name', async () => {
    const created = await request(app)
      .post('/api/inventory')
      .send({ name: 'Cordless  Drill', type: 'tool', quantity: 2, notes: 'garage' });
    expect(created.status).toBe(201);
    expect(created.body.normalized_name).toBe('cordless drill');
    expect(created.body.quantity).toBe(2);
    const id = created.body.id;

    const got = await request(app).get(`/api/inventory/${id}`);
    expect(got.status).toBe(200);

    const list = await request(app).get('/api/inventory');
    expect(list.body.some((i) => i.id === id)).toBe(true);

    const updated = await request(app).put(`/api/inventory/${id}`).send({ name: 'Impact   Driver' });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Impact   Driver');
    expect(updated.body.normalized_name).toBe('impact driver');

    const del = await request(app).delete(`/api/inventory/${id}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/inventory/${id}`)).status).toBe(404);
  });

  it('validates name and type', async () => {
    expect((await request(app).post('/api/inventory').send({ type: 'tool' })).status).toBe(400);
    expect((await request(app).post('/api/inventory').send({ name: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/inventory').send({ name: 'x', type: 'gadget' })).status).toBe(400);
  });

  it('returns 404 for unknown ids', async () => {
    expect((await request(app).get('/api/inventory/999999')).status).toBe(404);
    expect((await request(app).put('/api/inventory/999999').send({ name: 'x' })).status).toBe(404);
    expect((await request(app).delete('/api/inventory/999999')).status).toBe(404);
  });

  it('nulls a linked project_item on delete rather than erroring', async () => {
    const inv = await request(app).post('/api/inventory').send({ name: 'Hammer', type: 'tool' });
    const p = db.prepare('INSERT INTO projects (name) VALUES (?)').run('Linked').lastInsertRowid;
    const item = db
      .prepare('INSERT INTO project_items (project_id, name, normalized_name, type, inventory_id) VALUES (?,?,?,?,?)')
      .run(p, 'Hammer', 'hammer', 'tool', inv.body.id).lastInsertRowid;

    const del = await request(app).delete(`/api/inventory/${inv.body.id}`);
    expect(del.status).toBe(204);

    const row = db.prepare('SELECT inventory_id FROM project_items WHERE id = ?').get(item);
    expect(row.inventory_id).toBeNull();
  });
});
