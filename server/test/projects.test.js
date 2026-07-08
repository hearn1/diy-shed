import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

const dbPath = path.join(os.tmpdir(), `diy-shed-projects-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.DIYSHED_DB = dbPath;

let app;

beforeAll(async () => {
  app = (await import('../src/app.js')).default;
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

describe('projects API', () => {
  it('runs the full CRUD happy path', async () => {
    const created = await request(app)
      .post('/api/projects')
      .send({ name: 'Build a shed', description: 'in the yard', priority: 'highly_desired' });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Build a shed');
    expect(created.body.priority).toBe('highly_desired');
    expect(created.body.status).toBe('ready');
    const id = created.body.id;

    const got = await request(app).get(`/api/projects/${id}`);
    expect(got.status).toBe(200);
    expect(got.body.description).toBe('in the yard');

    const list = await request(app).get('/api/projects');
    expect(list.status).toBe(200);
    expect(list.body.some((p) => p.id === id)).toBe(true);

    const updated = await request(app)
      .put(`/api/projects/${id}`)
      .send({ status: 'in_progress', effort_level: 'Medium', effort_hours: 8, skill_level: 'Intermediate' });
    expect(updated.status).toBe(200);
    expect(updated.body.status).toBe('in_progress');
    expect(updated.body.effort_level).toBe('Medium');
    expect(updated.body.effort_hours).toBe(8);
    expect(updated.body.skill_level).toBe('Intermediate');

    const del = await request(app).delete(`/api/projects/${id}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/projects/${id}`)).status).toBe(404);
  });

  it('rejects missing name on create', async () => {
    const res = await request(app).post('/api/projects').send({ description: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid enum values with 400 and does not write', async () => {
    const before = (await request(app).get('/api/projects')).body.length;
    const res = await request(app).post('/api/projects').send({ name: 'x', priority: 'nope' });
    expect(res.status).toBe(400);
    const bad = await request(app).post('/api/projects').send({ name: 'x', status: 'bogus' });
    expect(bad.status).toBe(400);
    const after = (await request(app).get('/api/projects')).body.length;
    expect(after).toBe(before);
  });

  it('rejects invalid enum on update', async () => {
    const created = await request(app).post('/api/projects').send({ name: 'Enum test' });
    const res = await request(app)
      .put(`/api/projects/${created.body.id}`)
      .send({ effort_level: 'Extreme' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown ids', async () => {
    expect((await request(app).get('/api/projects/999999')).status).toBe(404);
    expect((await request(app).put('/api/projects/999999').send({ name: 'x' })).status).toBe(404);
    expect((await request(app).delete('/api/projects/999999')).status).toBe(404);
  });
});
