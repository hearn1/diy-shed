import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

const dbPath = path.join(os.tmpdir(), `diy-shed-settings-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

describe('settings API', () => {
  it('returns the seeded default of 0.5 and a null provider', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ w_effort: 0.5, w_cost: 0.5, ai_provider: null });
  });

  it('persists a valid w_effort and derives w_cost on read', async () => {
    const put = await request(app).put('/api/settings').send({ w_effort: 0.7 });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ w_effort: 0.7, w_cost: expect.closeTo(0.3, 5), ai_provider: null });

    const get = await request(app).get('/api/settings');
    expect(get.body.w_effort).toBe(0.7);
    expect(get.body.w_cost).toBeCloseTo(0.3);
  });

  it('rejects out-of-range and non-numeric w_effort with 400', async () => {
    expect((await request(app).put('/api/settings').send({ w_effort: 1.5 })).status).toBe(400);
    expect((await request(app).put('/api/settings').send({ w_effort: -0.1 })).status).toBe(400);
    expect((await request(app).put('/api/settings').send({ w_effort: 'half' })).status).toBe(400);
    expect((await request(app).put('/api/settings').send({})).status).toBe(400);
  });

  it('persists a provider selection and echoes it back on GET', async () => {
    const put = await request(app).put('/api/settings/provider').send({ provider: 'gemini' });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ ai_provider: 'gemini' });

    const get = await request(app).get('/api/settings');
    expect(get.body.ai_provider).toBe('gemini');
  });

  it('rejects an unknown provider id with 400 and leaves the selection intact', async () => {
    await request(app).put('/api/settings/provider').send({ provider: 'claude' });
    const bad = await request(app).put('/api/settings/provider').send({ provider: 'bogus' });
    expect(bad.status).toBe(400);
    expect((await request(app).get('/api/settings')).body.ai_provider).toBe('claude');
  });

  it('unsets the selection when provider is null', async () => {
    await request(app).put('/api/settings/provider').send({ provider: 'gemini' });
    const unset = await request(app).put('/api/settings/provider').send({ provider: null });
    expect(unset.status).toBe(200);
    expect(unset.body).toEqual({ ai_provider: null });
    expect((await request(app).get('/api/settings')).body.ai_provider).toBeNull();
  });
});
