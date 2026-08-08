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

function insertResearchStep(projectId, text, { done = false, position } = {}) {
  const pos = position ?? db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM project_steps WHERE project_id = ?').get(projectId).p + 1;
  const info = db
    .prepare("INSERT INTO project_steps (project_id, text, done, source, position) VALUES (?,?,?, 'research', ?)")
    .run(projectId, text, done ? 1 : 0, pos);
  return db.prepare('SELECT * FROM project_steps WHERE id = ?').get(info.lastInsertRowid);
}

describe('project steps API', () => {
  it('creates a manual step at the end and lists steps in order', async () => {
    const pid = await newProject();
    insertResearchStep(pid, 'Mark out the frame');

    const created = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Buy extra screws' });
    expect(created.status).toBe(201);
    expect(created.body.text).toBe('Buy extra screws');
    expect(created.body.source).toBe('manual');
    expect(created.body.done).toBe(0);

    const list = await request(app).get(`/api/projects/${pid}/steps`);
    expect(list.status).toBe(200);
    expect(list.body.map((s) => s.text)).toEqual(['Mark out the frame', 'Buy extra screws']);
  });

  it('requires non-empty text on create', async () => {
    const pid = await newProject();
    expect((await request(app).post(`/api/projects/${pid}/steps`).send({ text: '   ' })).status).toBe(400);
    expect((await request(app).post(`/api/projects/${pid}/steps`).send({})).status).toBe(400);
  });

  it('404s for an unknown project', async () => {
    expect((await request(app).get('/api/projects/999999/steps')).status).toBe(404);
    expect((await request(app).post('/api/projects/999999/steps').send({ text: 'x' })).status).toBe(404);
  });

  it('edits step text and persists it', async () => {
    const pid = await newProject();
    const created = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Cut lumber' });

    const updated = await request(app)
      .put(`/api/projects/${pid}/steps/${created.body.id}`)
      .send({ text: 'Cut lumber to size' });
    expect(updated.status).toBe(200);
    expect(updated.body.text).toBe('Cut lumber to size');

    const reload = await request(app).get(`/api/projects/${pid}/steps`);
    expect(reload.body[0].text).toBe('Cut lumber to size');
  });

  it('rejects blank text on edit', async () => {
    const pid = await newProject();
    const created = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Cut lumber' });
    const res = await request(app).put(`/api/projects/${pid}/steps/${created.body.id}`).send({ text: '  ' });
    expect(res.status).toBe(400);
  });

  it('flips an AI-generated step to manual once its text is edited, but not on an unchanged edit', async () => {
    const pid = await newProject();
    const step = insertResearchStep(pid, 'Mark out the frame');

    const unchanged = await request(app)
      .put(`/api/projects/${pid}/steps/${step.id}`)
      .send({ text: 'Mark out the frame' });
    expect(unchanged.body.source).toBe('research');

    const edited = await request(app)
      .put(`/api/projects/${pid}/steps/${step.id}`)
      .send({ text: 'Mark out the frame precisely' });
    expect(edited.body.source).toBe('manual');
  });

  it('toggles done on and off and persists it', async () => {
    const pid = await newProject();
    const created = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Cut lumber' });

    const checked = await request(app).put(`/api/projects/${pid}/steps/${created.body.id}`).send({ done: true });
    expect(checked.status).toBe(200);
    expect(checked.body.done).toBe(1);

    const reload = await request(app).get(`/api/projects/${pid}/steps`);
    expect(reload.body[0].done).toBe(1);

    const unchecked = await request(app).put(`/api/projects/${pid}/steps/${created.body.id}`).send({ done: false });
    expect(unchecked.body.done).toBe(0);
  });

  it('rejects a non-boolean done value', async () => {
    const pid = await newProject();
    const created = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Cut lumber' });
    const res = await request(app).put(`/api/projects/${pid}/steps/${created.body.id}`).send({ done: 'yes' });
    expect(res.status).toBe(400);
  });

  it('refuses to change done on a step of a completed project, but still allows editing text', async () => {
    const pid = await newProject();
    const created = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Cut lumber' });
    await request(app).put(`/api/projects/${pid}`).send({ status: 'done' });

    const res = await request(app).put(`/api/projects/${pid}/steps/${created.body.id}`).send({ done: true });
    expect(res.status).toBe(400);

    const textEdit = await request(app)
      .put(`/api/projects/${pid}/steps/${created.body.id}`)
      .send({ text: 'Cut lumber precisely' });
    expect(textEdit.status).toBe(200);
  });

  it('deletes a step', async () => {
    const pid = await newProject();
    const created = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Cut lumber' });
    const del = await request(app).delete(`/api/projects/${pid}/steps/${created.body.id}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/projects/${pid}/steps`)).body).toHaveLength(0);
  });

  it('404s deleting or updating an unknown step', async () => {
    const pid = await newProject();
    expect((await request(app).delete(`/api/projects/${pid}/steps/999999`)).status).toBe(404);
    expect((await request(app).put(`/api/projects/${pid}/steps/999999`).send({ text: 'x' })).status).toBe(404);
  });

  it('cascades step deletion when the project is deleted', async () => {
    const pid = await newProject();
    await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Cut lumber' });
    await request(app).delete(`/api/projects/${pid}`);
    const remaining = db.prepare('SELECT COUNT(*) c FROM project_steps WHERE project_id = ?').get(pid).c;
    expect(remaining).toBe(0);
  });

  it('moves a step up and down, persisting the new order, and no-ops at the boundaries', async () => {
    const pid = await newProject();
    const a = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'A' });
    const b = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'B' });
    const c = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'C' });

    const movedUp = await request(app).post(`/api/projects/${pid}/steps/${c.body.id}/move`).send({ direction: 'up' });
    expect(movedUp.status).toBe(200);
    expect(movedUp.body.map((s) => s.text)).toEqual(['A', 'C', 'B']);

    const persisted = await request(app).get(`/api/projects/${pid}/steps`);
    expect(persisted.body.map((s) => s.text)).toEqual(['A', 'C', 'B']);

    const boundary = await request(app).post(`/api/projects/${pid}/steps/${a.body.id}/move`).send({ direction: 'up' });
    expect(boundary.body.map((s) => s.text)).toEqual(['A', 'C', 'B']);

    const movedDown = await request(app)
      .post(`/api/projects/${pid}/steps/${a.body.id}/move`)
      .send({ direction: 'down' });
    expect(movedDown.body.map((s) => s.text)).toEqual(['C', 'A', 'B']);

    const otherBoundary = await request(app)
      .post(`/api/projects/${pid}/steps/${b.body.id}/move`)
      .send({ direction: 'down' });
    expect(otherBoundary.body.map((s) => s.text)).toEqual(['C', 'A', 'B']);
  });

  it('rejects an invalid move direction', async () => {
    const pid = await newProject();
    const a = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'A' });
    const res = await request(app).post(`/api/projects/${pid}/steps/${a.body.id}/move`).send({ direction: 'sideways' });
    expect(res.status).toBe(400);
  });

  it('starting a ready project does not touch its steps', async () => {
    const pid = await newProject();
    await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Cut lumber' });
    const before = (await request(app).get(`/api/projects/${pid}/steps`)).body;

    const started = await request(app).put(`/api/projects/${pid}`).send({ status: 'in_progress' });
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('in_progress');

    const after = (await request(app).get(`/api/projects/${pid}/steps`)).body;
    expect(after).toEqual(before);
  });
});
