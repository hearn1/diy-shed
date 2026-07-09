import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

vi.mock('../src/research/claudeCli.js', () => ({ isClaudeAvailable: () => Promise.resolve(false) }));

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
  it('returns the seeded default of 0.5', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ w_effort: 0.5, w_cost: 0.5 });
  });

  it('persists a valid w_effort and derives w_cost on read', async () => {
    const put = await request(app).put('/api/settings').send({ w_effort: 0.7 });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ w_effort: 0.7, w_cost: expect.closeTo(0.3, 5) });

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
});
