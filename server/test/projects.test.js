import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

const enqueue = vi.fn(() => Promise.resolve());
const researchProject = vi.fn(() => Promise.resolve('ready'));
const isClaudeAvailable = vi.fn(() => Promise.resolve(false));

vi.mock('../src/research/queue.js', () => ({ enqueue: (fn) => enqueue(fn) }));
vi.mock('../src/research/runner.js', () => ({ researchProject: (id) => researchProject(id) }));
vi.mock('../src/research/claudeCli.js', () => ({ isClaudeAvailable: () => isClaudeAvailable() }));

const dbPath = path.join(os.tmpdir(), `diy-shed-projects-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.DIYSHED_DB = dbPath;

let app;

beforeAll(async () => {
  app = (await import('../src/app.js')).default;
});

beforeEach(() => {
  enqueue.mockClear();
  researchProject.mockClear();
  isClaudeAvailable.mockReset();
  isClaudeAvailable.mockResolvedValue(false);
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

  it('GET includes an embedded guides array', async () => {
    const created = await request(app).post('/api/projects').send({ name: 'With guides' });
    const got = await request(app).get(`/api/projects/${created.body.id}`);
    expect(Array.isArray(got.body.guides)).toBe(true);
  });
});

describe('projects research triggering', () => {
  it('returns 201 immediately and enqueues research when the CLI is available', async () => {
    isClaudeAvailable.mockResolvedValue(true);
    const res = await request(app).post('/api/projects').send({ name: 'Auto research' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('researching');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('creates as ready and does not enqueue when the CLI is unavailable', async () => {
    isClaudeAvailable.mockResolvedValue(false);
    const res = await request(app).post('/api/projects').send({ name: 'No CLI' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ready');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('skips research on ?research=false even when the CLI is available', async () => {
    isClaudeAvailable.mockResolvedValue(true);
    const res = await request(app).post('/api/projects?research=false').send({ name: 'Manual only' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ready');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('re-run endpoint returns 202, sets researching and enqueues', async () => {
    const created = await request(app).post('/api/projects').send({ name: 'Rerun me' });
    enqueue.mockClear();
    const res = await request(app).post(`/api/projects/${created.body.id}/research`);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('researching');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('re-run endpoint 404s on an unknown id', async () => {
    const res = await request(app).post('/api/projects/999999/research');
    expect(res.status).toBe(404);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
