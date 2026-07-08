import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

const dbPath = path.join(os.tmpdir(), `diy-shed-items-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

async function newProject(name = 'Items project') {
  const res = await request(app).post('/api/projects').send({ name });
  return res.body.id;
}

describe('project items API', () => {
  it('creates, lists, updates, and deletes items under a project', async () => {
    const pid = await newProject();

    const tool = await request(app)
      .post(`/api/projects/${pid}/items`)
      .send({ name: 'Circular  Saw', type: 'tool', est_cost: 120 });
    expect(tool.status).toBe(201);
    expect(tool.body.normalized_name).toBe('circular saw');

    const material = await request(app)
      .post(`/api/projects/${pid}/items`)
      .send({ name: 'Plywood', type: 'material', est_cost: 40 });
    expect(material.status).toBe(201);

    const list = await request(app).get(`/api/projects/${pid}/items`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);

    const updated = await request(app)
      .put(`/api/projects/${pid}/items/${tool.body.id}`)
      .send({ name: 'Table Saw', est_cost: 300 });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Table Saw');
    expect(updated.body.normalized_name).toBe('table saw');
    expect(updated.body.est_cost).toBe(300);

    const del = await request(app).delete(`/api/projects/${pid}/items/${material.body.id}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/projects/${pid}/items`)).body).toHaveLength(1);
  });

  it('validates type and requires name', async () => {
    const pid = await newProject();
    expect((await request(app).post(`/api/projects/${pid}/items`).send({ type: 'tool' })).status).toBe(400);
    expect((await request(app).post(`/api/projects/${pid}/items`).send({ name: 'x', type: 'gizmo' })).status).toBe(400);
  });

  it('404s when the project does not exist', async () => {
    expect((await request(app).get('/api/projects/999999/items')).status).toBe(404);
    expect((await request(app).post('/api/projects/999999/items').send({ name: 'x', type: 'tool' })).status).toBe(404);
  });

  it('cascades item deletion when the project is deleted', async () => {
    const pid = await newProject();
    await request(app).post(`/api/projects/${pid}/items`).send({ name: 'Nail', type: 'material' });
    await request(app).delete(`/api/projects/${pid}`);
    const remaining = db.prepare('SELECT COUNT(*) c FROM project_items WHERE project_id = ?').get(pid).c;
    expect(remaining).toBe(0);
  });

  it('round-trips effort fields via the projects PUT', async () => {
    const pid = await newProject();
    const res = await request(app)
      .put(`/api/projects/${pid}`)
      .send({ effort_level: 'High', effort_hours: 12.5, skill_level: 'Advanced' });
    expect(res.status).toBe(200);
    expect(res.body.effort_level).toBe('High');
    expect(res.body.effort_hours).toBe(12.5);
    expect(res.body.skill_level).toBe('Advanced');

    const reload = await request(app).get(`/api/projects/${pid}`);
    expect(reload.body.effort_level).toBe('High');
    expect(reload.body.effort_hours).toBe(12.5);
    expect(reload.body.skill_level).toBe('Advanced');
  });
});
