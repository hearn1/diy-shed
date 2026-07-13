import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

const enqueue = vi.fn(() => Promise.resolve());
const researchProject = vi.fn(() => Promise.resolve('ready'));
const isSelectedProviderAvailable = vi.fn(() => Promise.resolve(false));

vi.mock('../src/research/queue.js', () => ({ enqueue: (fn) => enqueue(fn) }));
vi.mock('../src/research/runner.js', () => ({ researchProject: (id) => researchProject(id) }));
vi.mock('../src/research/selection.js', () => ({
  isSelectedProviderAvailable: () => isSelectedProviderAvailable(),
  getSelectedProviderId: () => null,
  setSelectedProviderId: () => null
}));

const dbPath = path.join(os.tmpdir(), `diy-shed-projects-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
process.env.DIYSHED_DB = dbPath;

let app;

beforeAll(async () => {
  app = (await import('../src/app.js')).default;
});

beforeEach(() => {
  enqueue.mockClear();
  researchProject.mockClear();
  isSelectedProviderAvailable.mockReset();
  isSelectedProviderAvailable.mockResolvedValue(false);
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
  it('returns 201 immediately and enqueues research when the selected provider is available', async () => {
    isSelectedProviderAvailable.mockResolvedValue(true);
    const res = await request(app).post('/api/projects').send({ name: 'Auto research' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('researching');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('creates as ready and does not enqueue when no provider is configured', async () => {
    isSelectedProviderAvailable.mockResolvedValue(false);
    const res = await request(app).post('/api/projects').send({ name: 'No provider' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ready');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('skips research on ?research=false even when the selected provider is available', async () => {
    isSelectedProviderAvailable.mockResolvedValue(true);
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

describe('projects ranking & gap', () => {
  async function makeProject(fields) {
    const created = await request(app).post('/api/projects?research=false').send({ name: fields.name });
    const id = created.body.id;
    const { name, ...rest } = fields;
    if (Object.keys(rest).length > 0) {
      await request(app).put(`/api/projects/${id}`).send(rest);
    }
    return id;
  }

  async function addItem(projectId, item) {
    return request(app).post(`/api/projects/${projectId}/items`).send(item);
  }

  it('GET /ranked excludes done projects and orders by score with the extra fields', async () => {
    const urgent = await makeProject({ name: 'Fix roof', priority: 'urgent_fix', effort_level: 'Low' });
    const dream = await makeProject({ name: 'Dream deck', priority: 'dreams', effort_level: 'Low' });
    const done = await makeProject({ name: 'Old task', priority: 'urgent_fix', status: 'done' });

    const res = await request(app).get('/api/projects/ranked');
    expect(res.status).toBe(200);
    const ids = res.body.map((p) => p.id);
    expect(ids).not.toContain(done);
    expect(ids.indexOf(urgent)).toBeLessThan(ids.indexOf(dream));
    const first = res.body[0];
    expect(first).toHaveProperty('rank');
    expect(first).toHaveProperty('missing_count');
    expect(first).toHaveProperty('est_cost');
    expect(first).toHaveProperty('base_score');
    expect(first).toHaveProperty('final_score');
  });

  it('honors a ?w_effort override without persisting it', async () => {
    await request(app).put('/api/settings').send({ w_effort: 0.5 });
    const cheapHigh = await makeProject({ name: 'Cheap hard', priority: 'slightly_desired', effort_level: 'High' });
    const dearLow = await makeProject({ name: 'Pricey easy', priority: 'slightly_desired', effort_level: 'Low' });
    await addItem(dearLow, { name: 'Expensive thing', type: 'material', est_cost: 999 });

    const effortOnly = await request(app).get('/api/projects/ranked?w_effort=1');
    const costOnly = await request(app).get('/api/projects/ranked?w_effort=0');
    const orderEffort = effortOnly.body.map((p) => p.id).filter((id) => id === cheapHigh || id === dearLow);
    const orderCost = costOnly.body.map((p) => p.id).filter((id) => id === cheapHigh || id === dearLow);
    expect(orderEffort).not.toEqual(orderCost);

    const settings = await request(app).get('/api/settings');
    expect(settings.body.w_effort).toBe(0.5);
  });

  it('drops est_cost / missing_count after an inventory match is added (FR4.3)', async () => {
    const id = await makeProject({ name: 'Needs a saw', priority: 'highly_desired', effort_level: 'Medium' });
    await addItem(id, { name: 'Circular Saw', type: 'tool', est_cost: 120 });

    const before = (await request(app).get('/api/projects/ranked')).body.find((p) => p.id === id);
    expect(before.missing_count).toBe(1);
    expect(before.est_cost).toBe(120);

    await request(app).post('/api/inventory').send({ name: 'circular saw', type: 'tool' });

    const after = (await request(app).get('/api/projects/ranked')).body.find((p) => p.id === id);
    expect(after.missing_count).toBe(0);
    expect(after.est_cost).toBe(0);
  });

  it('completion-review lists only unowned tools, never materials', async () => {
    const id = await makeProject({ name: 'Completion review' });
    await addItem(id, { name: 'Jigsaw', type: 'tool', est_cost: 70 });
    await addItem(id, { name: 'Owned Clamp', type: 'tool', est_cost: 12 });
    await addItem(id, { name: 'Sandpaper', type: 'material', est_cost: 8 });
    await request(app).post('/api/inventory').send({ name: 'owned clamp', type: 'tool' });

    const res = await request(app).get(`/api/projects/${id}/completion-review`);
    expect(res.status).toBe(200);
    expect(res.body.tools.map((t) => t.name)).toEqual(['Jigsaw']);
    expect(res.body.tools[0]).toEqual({ id: expect.any(Number), name: 'Jigsaw', est_cost: 70 });
  });

  it('complete adds selected tools to inventory and sets status done atomically', async () => {
    const id = await makeProject({ name: 'Complete me' });
    const jigsaw = await addItem(id, { name: 'Jigsaw', type: 'tool', est_cost: 70 });

    const res = await request(app).post(`/api/projects/${id}/complete`).send({ add_item_ids: [jigsaw.body.id] });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.gap.missing_count).toBe(0);

    const inv = (await request(app).get('/api/inventory')).body.find((i) => i.normalized_name === 'jigsaw');
    expect(inv).toBeTruthy();
  });

  it('complete with an empty add list just marks the project done', async () => {
    const id = await makeProject({ name: 'Empty complete' });
    await addItem(id, { name: 'Router', type: 'tool', est_cost: 90 });
    const res = await request(app).post(`/api/projects/${id}/complete`).send({ add_item_ids: [] });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.gap.missing_count).toBe(1);
  });

  it('complete is idempotent for an already-owned tool and rejects non-tool ids', async () => {
    const id = await makeProject({ name: 'Idempotent complete' });
    const clamp = await addItem(id, { name: 'Clamp', type: 'tool', est_cost: 12 });
    const glue = await addItem(id, { name: 'Glue', type: 'material', est_cost: 5 });
    await request(app).post('/api/inventory').send({ name: 'clamp', type: 'tool' });

    expect(
      (await request(app).post(`/api/projects/${id}/complete`).send({ add_item_ids: [glue.body.id] })).status
    ).toBe(400);

    const res = await request(app).post(`/api/projects/${id}/complete`).send({ add_item_ids: [clamp.body.id] });
    expect(res.status).toBe(200);
    const clamps = (await request(app).get('/api/inventory')).body.filter((i) => i.normalized_name === 'clamp');
    expect(clamps).toHaveLength(1);
  });

  it('GET /:id includes a correct gap block alongside guides', async () => {
    const id = await makeProject({ name: 'Detail gap', priority: 'highly_desired' });
    await addItem(id, { name: 'Owned Drill', type: 'tool', est_cost: 90 });
    await addItem(id, { name: 'Missing Bolts', type: 'material', est_cost: 15 });
    await request(app).post('/api/inventory').send({ name: 'owned drill', type: 'tool' });

    const res = await request(app).get(`/api/projects/${id}`);
    expect(Array.isArray(res.body.guides)).toBe(true);
    expect(res.body.gap.missing_count).toBe(1);
    expect(res.body.gap.est_cost).toBe(15);
    const owned = res.body.gap.items.find((i) => i.name === 'Owned Drill');
    expect(owned.owned).toBe(true);
  });
});
