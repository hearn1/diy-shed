import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

const dbPath = path.join(os.tmpdir(), `diy-shed-steps-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

async function newProject(name = 'Steps project') {
  const res = await request(app).post('/api/projects?research=false').send({ name });
  return res.body.id;
}

describe('execution steps API', () => {
  it('creates, lists, edits and deletes steps for a project', async () => {
    const pid = await newProject();

    const first = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Measure the space' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ text: 'Measure the space', done: 0, source: 'manual', position: 0 });

    const second = await request(app).post(`/api/projects/${pid}/steps`).send({ text: '  Buy lumber  ' });
    expect(second.status).toBe(201);
    expect(second.body.text).toBe('Buy lumber');
    expect(second.body.position).toBe(1);

    const list = await request(app).get(`/api/projects/${pid}/steps`);
    expect(list.status).toBe(200);
    expect(list.body.map((s) => s.text)).toEqual(['Measure the space', 'Buy lumber']);

    const edited = await request(app)
      .put(`/api/projects/${pid}/steps/${first.body.id}`)
      .send({ text: 'Measure the space twice' });
    expect(edited.status).toBe(200);
    expect(edited.body.text).toBe('Measure the space twice');

    const del = await request(app).delete(`/api/projects/${pid}/steps/${second.body.id}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/projects/${pid}/steps`)).body).toHaveLength(1);
  });

  it('rejects empty text on create and edit', async () => {
    const pid = await newProject();
    expect((await request(app).post(`/api/projects/${pid}/steps`).send({ text: '   ' })).status).toBe(400);
    const step = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'ok' });
    expect((await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ text: '' })).status).toBe(400);
  });

  it('404s for an unknown project or step', async () => {
    expect((await request(app).get('/api/projects/999999/steps')).status).toBe(404);
    expect((await request(app).post('/api/projects/999999/steps').send({ text: 'x' })).status).toBe(404);
    const pid = await newProject();
    expect((await request(app).put(`/api/projects/${pid}/steps/999999`).send({ text: 'x' })).status).toBe(404);
    expect((await request(app).delete(`/api/projects/${pid}/steps/999999`)).status).toBe(404);
  });

  it('toggles done on and off, and rejects a non-boolean value', async () => {
    const pid = await newProject();
    const step = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Sand the edges' });

    const checked = await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ done: true });
    expect(checked.status).toBe(200);
    expect(checked.body.done).toBe(1);

    const unchecked = await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ done: false });
    expect(unchecked.body.done).toBe(0);

    expect(
      (await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ done: 'yes' })).status
    ).toBe(400);
  });

  it('checking a step never changes the project status', async () => {
    const pid = await newProject();
    const step = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Sand the edges' });
    await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ done: true });
    const project = await request(app).get(`/api/projects/${pid}`);
    expect(project.body.status).toBe('ready');
  });

  it('refuses to toggle done once the project is finished', async () => {
    const pid = await newProject();
    const step = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Sand the edges' });
    await request(app).post(`/api/projects/${pid}/complete`).send({ add_item_ids: [] });

    const res = await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ done: true });
    expect(res.status).toBe(400);
  });

  it('editing an AI-generated step turns it into a manual one', async () => {
    const pid = await newProject();
    db.prepare(
      "INSERT INTO execution_steps (project_id, text, done, source, position) VALUES (?, 'Old AI step', 0, 'research', 0)"
    ).run(pid);
    const step = db.prepare('SELECT * FROM execution_steps WHERE project_id = ?').get(pid);
    expect(step.source).toBe('research');

    const edited = await request(app)
      .put(`/api/projects/${pid}/steps/${step.id}`)
      .send({ text: 'My rewritten step' });
    expect(edited.body.source).toBe('manual');
    expect(edited.body.text).toBe('My rewritten step');
  });

  it('reorders with move up/down and persists the new order', async () => {
    const pid = await newProject();
    const a = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'A' });
    const b = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'B' });
    const c = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'C' });

    const moved = await request(app).post(`/api/projects/${pid}/steps/${c.body.id}/move`).send({ direction: 'up' });
    expect(moved.status).toBe(200);
    expect(moved.body.map((s) => s.text)).toEqual(['A', 'C', 'B']);

    const list = await request(app).get(`/api/projects/${pid}/steps`);
    expect(list.body.map((s) => s.text)).toEqual(['A', 'C', 'B']);

    const movedDown = await request(app).post(`/api/projects/${pid}/steps/${a.body.id}/move`).send({ direction: 'down' });
    expect(movedDown.body.map((s) => s.text)).toEqual(['C', 'A', 'B']);
  });

  it('is a no-op when moving the first step up or the last step down', async () => {
    const pid = await newProject();
    const a = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'A' });
    const b = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'B' });

    const upAtTop = await request(app).post(`/api/projects/${pid}/steps/${a.body.id}/move`).send({ direction: 'up' });
    expect(upAtTop.body.map((s) => s.text)).toEqual(['A', 'B']);

    const downAtBottom = await request(app)
      .post(`/api/projects/${pid}/steps/${b.body.id}/move`)
      .send({ direction: 'down' });
    expect(downAtBottom.body.map((s) => s.text)).toEqual(['A', 'B']);
  });

  it('rejects an invalid move direction', async () => {
    const pid = await newProject();
    const a = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'A' });
    expect(
      (await request(app).post(`/api/projects/${pid}/steps/${a.body.id}/move`).send({ direction: 'sideways' })).status
    ).toBe(400);
  });

  it('cascades step deletion when the project is deleted', async () => {
    const pid = await newProject();
    await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Doomed step' });
    await request(app).delete(`/api/projects/${pid}`);
    const remaining = db.prepare('SELECT COUNT(*) c FROM execution_steps WHERE project_id = ?').get(pid).c;
    expect(remaining).toBe(0);
  });
});

describe('project start action', () => {
  it('moves a ready project to in_progress without touching its checklist', async () => {
    const pid = await newProject();
    await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Step one' });

    const res = await request(app).post(`/api/projects/${pid}/start`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');

    const steps = await request(app).get(`/api/projects/${pid}/steps`);
    expect(steps.body).toHaveLength(1);
  });

  it('refuses to start a project that is not ready', async () => {
    const pid = await newProject();
    await request(app).post(`/api/projects/${pid}/start`);
    const res = await request(app).post(`/api/projects/${pid}/start`);
    expect(res.status).toBe(400);
  });

  it('404s for an unknown project', async () => {
    expect((await request(app).post('/api/projects/999999/start')).status).toBe(404);
  });
});
