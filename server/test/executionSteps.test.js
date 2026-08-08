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
  const res = await request(app).post('/api/projects').send({ name });
  return res.body.id;
}

describe('execution steps API', () => {
  it('creates, lists, edits and deletes steps under a project', async () => {
    const pid = await newProject();

    const first = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Shut off water' });
    expect(first.status).toBe(201);
    expect(first.body.text).toBe('Shut off water');
    expect(first.body.source).toBe('manual');
    expect(first.body.done).toBe(0);
    expect(first.body.position).toBe(0);

    const second = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'Remove old faucet' });
    expect(second.status).toBe(201);
    expect(second.body.position).toBe(1);

    const list = await request(app).get(`/api/projects/${pid}/steps`);
    expect(list.status).toBe(200);
    expect(list.body.map((s) => s.text)).toEqual(['Shut off water', 'Remove old faucet']);

    const edited = await request(app)
      .put(`/api/projects/${pid}/steps/${first.body.id}`)
      .send({ text: 'Shut off the main water supply' });
    expect(edited.status).toBe(200);
    expect(edited.body.text).toBe('Shut off the main water supply');

    const del = await request(app).delete(`/api/projects/${pid}/steps/${second.body.id}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/projects/${pid}/steps`)).body).toHaveLength(1);
  });

  it('requires non-empty text', async () => {
    const pid = await newProject();
    expect((await request(app).post(`/api/projects/${pid}/steps`).send({ text: '  ' })).status).toBe(400);
    expect((await request(app).post(`/api/projects/${pid}/steps`).send({})).status).toBe(400);

    const step = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'A step' });
    expect((await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ text: '' })).status).toBe(
      400
    );
  });

  it('404s when the project or step does not exist', async () => {
    expect((await request(app).get('/api/projects/999999/steps')).status).toBe(404);
    expect((await request(app).post('/api/projects/999999/steps').send({ text: 'x' })).status).toBe(404);

    const pid = await newProject();
    expect((await request(app).put(`/api/projects/${pid}/steps/999999`).send({ text: 'x' })).status).toBe(404);
    expect((await request(app).delete(`/api/projects/${pid}/steps/999999`)).status).toBe(404);
    expect((await request(app).post(`/api/projects/${pid}/steps/999999/move`).send({ direction: 'up' })).status).toBe(
      404
    );
  });

  it('cascades step deletion when the project is deleted', async () => {
    const pid = await newProject();
    await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'A step' });
    await request(app).delete(`/api/projects/${pid}`);
    const remaining = db.prepare('SELECT COUNT(*) c FROM execution_steps WHERE project_id = ?').get(pid).c;
    expect(remaining).toBe(0);
  });

  it('toggles done and clears it again', async () => {
    const pid = await newProject();
    const step = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'A step' });

    const checked = await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ done: true });
    expect(checked.status).toBe(200);
    expect(checked.body.done).toBe(1);

    const unchecked = await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ done: false });
    expect(unchecked.body.done).toBe(0);
  });

  it('rejects a non-boolean done value', async () => {
    const pid = await newProject();
    const step = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'A step' });
    expect(
      (await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ done: 'yes' })).status
    ).toBe(400);
  });

  it('blocks checking a step once the project is done', async () => {
    const pid = await newProject();
    const step = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'A step' });
    await request(app).put(`/api/projects/${pid}`).send({ status: 'done' });

    const res = await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ done: true });
    expect(res.status).toBe(400);
  });

  it('allows checking a step regardless of status other than done', async () => {
    const pid = await newProject();
    const step = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'A step' });
    await request(app).put(`/api/projects/${pid}`).send({ status: 'in_progress' });

    const res = await request(app).put(`/api/projects/${pid}/steps/${step.body.id}`).send({ done: true });
    expect(res.status).toBe(200);
    expect(res.body.done).toBe(1);
  });

  it('flips a research-sourced step to manual once its text is edited', async () => {
    const pid = await newProject();
    db.prepare(
      "INSERT INTO execution_steps (project_id, text, done, source, position) VALUES (?, 'AI step', 0, 'research', 0)"
    ).run(pid);
    const step = db.prepare('SELECT * FROM execution_steps WHERE project_id = ?').get(pid);
    expect(step.source).toBe('research');

    const edited = await request(app).put(`/api/projects/${pid}/steps/${step.id}`).send({ text: 'Edited text' });
    expect(edited.body.source).toBe('manual');

    // Toggling done afterwards must not flip it back.
    const toggled = await request(app).put(`/api/projects/${pid}/steps/${step.id}`).send({ done: true });
    expect(toggled.body.source).toBe('manual');
  });

  it('moves a step up and down, persisting the new order', async () => {
    const pid = await newProject();
    const a = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'A' });
    const b = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'B' });
    const c = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'C' });

    const afterDown = await request(app).post(`/api/projects/${pid}/steps/${a.body.id}/move`).send({ direction: 'down' });
    expect(afterDown.status).toBe(200);
    expect(afterDown.body.map((s) => s.text)).toEqual(['B', 'A', 'C']);

    const afterUp = await request(app).post(`/api/projects/${pid}/steps/${c.body.id}/move`).send({ direction: 'up' });
    expect(afterUp.body.map((s) => s.text)).toEqual(['B', 'C', 'A']);

    const reloaded = await request(app).get(`/api/projects/${pid}/steps`);
    expect(reloaded.body.map((s) => s.text)).toEqual(['B', 'C', 'A']);
  });

  it('is a no-op moving the first step up or the last step down', async () => {
    const pid = await newProject();
    const a = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'A' });
    const b = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'B' });

    const res1 = await request(app).post(`/api/projects/${pid}/steps/${a.body.id}/move`).send({ direction: 'up' });
    expect(res1.body.map((s) => s.text)).toEqual(['A', 'B']);

    const res2 = await request(app).post(`/api/projects/${pid}/steps/${b.body.id}/move`).send({ direction: 'down' });
    expect(res2.body.map((s) => s.text)).toEqual(['A', 'B']);
  });

  it('rejects an invalid move direction', async () => {
    const pid = await newProject();
    const a = await request(app).post(`/api/projects/${pid}/steps`).send({ text: 'A' });
    expect(
      (await request(app).post(`/api/projects/${pid}/steps/${a.body.id}/move`).send({ direction: 'sideways' })).status
    ).toBe(400);
  });
});
