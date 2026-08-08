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

async function addStep(pid, text) {
  return request(app).post(`/api/projects/${pid}/steps`).send({ text });
}

describe('project steps API', () => {
  it('creates, lists, updates and deletes steps under a project', async () => {
    const pid = await newProject();

    const created = await addStep(pid, 'Cut the boards');
    expect(created.status).toBe(201);
    expect(created.body.text).toBe('Cut the boards');
    expect(created.body.done).toBe(false);
    expect(created.body.source).toBe('manual');
    expect(created.body.position).toBe(0);

    const second = await addStep(pid, 'Assemble the frame');
    expect(second.body.position).toBe(1);

    const list = await request(app).get(`/api/projects/${pid}/steps`);
    expect(list.status).toBe(200);
    expect(list.body.map((s) => s.text)).toEqual(['Cut the boards', 'Assemble the frame']);

    const updated = await request(app)
      .put(`/api/projects/${pid}/steps/${created.body.id}`)
      .send({ text: 'Cut the boards to length' });
    expect(updated.status).toBe(200);
    expect(updated.body.text).toBe('Cut the boards to length');

    const del = await request(app).delete(`/api/projects/${pid}/steps/${created.body.id}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/projects/${pid}/steps`)).body).toHaveLength(1);
  });

  it('trims text and rejects blank text on create and update', async () => {
    const pid = await newProject();
    const blank = await addStep(pid, '   ');
    expect(blank.status).toBe(400);

    const spaced = await addStep(pid, '  Sand the edges  ');
    expect(spaced.body.text).toBe('Sand the edges');

    const badUpdate = await request(app).put(`/api/projects/${pid}/steps/${spaced.body.id}`).send({ text: '  ' });
    expect(badUpdate.status).toBe(400);
  });

  it('404s when the project or step does not exist', async () => {
    expect((await request(app).get('/api/projects/999999/steps')).status).toBe(404);
    expect((await request(app).post('/api/projects/999999/steps').send({ text: 'x' })).status).toBe(404);
    const pid = await newProject();
    expect((await request(app).put(`/api/projects/${pid}/steps/999999`).send({ text: 'x' })).status).toBe(404);
    expect((await request(app).delete(`/api/projects/${pid}/steps/999999`)).status).toBe(404);
  });

  it('cascades step deletion when the project is deleted', async () => {
    const pid = await newProject();
    await addStep(pid, 'Step');
    await request(app).delete(`/api/projects/${pid}`);
    const remaining = db.prepare('SELECT COUNT(*) c FROM project_steps WHERE project_id = ?').get(pid).c;
    expect(remaining).toBe(0);
  });

  it('checks a step done and back to not-done', async () => {
    const pid = await newProject();
    const step = await addStep(pid, 'Paint it');

    const checked = await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ done: true });
    expect(checked.status).toBe(200);
    expect(checked.body.done).toBe(true);

    const unchecked = await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ done: false });
    expect(unchecked.body.done).toBe(false);
  });

  it('rejects checking a step once the project is done', async () => {
    const pid = await newProject();
    const step = await addStep(pid, 'Paint it');
    await request(app).post(`/api/projects/${pid}/complete`).send({ add_item_ids: [] });

    const res = await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ done: true });
    expect(res.status).toBe(400);
  });

  it('editing an AI-generated step turns it manual', async () => {
    const pid = await newProject();
    db.prepare(
      "INSERT INTO project_steps (project_id, text, source, position) VALUES (?, 'AI step', 'research', 0)"
    ).run(pid);
    const step = db.prepare('SELECT * FROM project_steps WHERE project_id = ?').get(pid);
    expect(step.source).toBe('research');

    const edited = await request(app).put(`/api/projects/${pid}/steps/${step.id}`).send({ text: 'AI step, tweaked' });
    expect(edited.body.source).toBe('manual');
  });

  it('checking a step does not change project status', async () => {
    const pid = await newProject();
    const step = await addStep(pid, 'Paint it');
    await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ done: true });
    const project = await request(app).get(`/api/projects/${pid}`);
    expect(project.body.status).toBe('ready');
  });

  it('reorders steps up and down and persists the new order', async () => {
    const pid = await newProject();
    const a = await addStep(pid, 'A');
    const b = await addStep(pid, 'B');
    const c = await addStep(pid, 'C');

    const moved = await request(app).post(`/api/projects/${pid}/steps/${c.body.id}/move`).send({ direction: 'up' });
    expect(moved.status).toBe(200);
    expect(moved.body.map((s) => s.text)).toEqual(['A', 'C', 'B']);

    const reloaded = await request(app).get(`/api/projects/${pid}/steps`);
    expect(reloaded.body.map((s) => s.text)).toEqual(['A', 'C', 'B']);

    const movedDown = await request(app).post(`/api/projects/${pid}/steps/${a.body.id}/move`).send({ direction: 'down' });
    expect(movedDown.body.map((s) => s.text)).toEqual(['C', 'A', 'B']);
  });

  it('is a no-op to move the first step up or the last step down', async () => {
    const pid = await newProject();
    const a = await addStep(pid, 'A');
    const b = await addStep(pid, 'B');

    const upAtTop = await request(app).post(`/api/projects/${pid}/steps/${a.body.id}/move`).send({ direction: 'up' });
    expect(upAtTop.body.map((s) => s.text)).toEqual(['A', 'B']);

    const downAtBottom = await request(app).post(`/api/projects/${pid}/steps/${b.body.id}/move`).send({ direction: 'down' });
    expect(downAtBottom.body.map((s) => s.text)).toEqual(['A', 'B']);
  });

  it('rejects an invalid move direction', async () => {
    const pid = await newProject();
    const a = await addStep(pid, 'A');
    const res = await request(app).post(`/api/projects/${pid}/steps/${a.body.id}/move`).send({ direction: 'sideways' });
    expect(res.status).toBe(400);
  });
});
