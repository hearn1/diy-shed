import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diy-shed-dist-'));
const dbPath = path.join(os.tmpdir(), `diy-shed-static-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
const html = '<!doctype html><html><body><div id="root">app</div></body></html>';

process.env.DIYSHED_CLIENT_DIST = fixtureDir;
process.env.DIYSHED_DB = dbPath;

let app;

beforeAll(async () => {
  fs.writeFileSync(path.join(fixtureDir, 'index.html'), html);
  app = (await import('../src/app.js')).default;
});

afterAll(() => {
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      // ignore
    }
  }
});

describe('static serving', () => {
  it('serves the built index.html at /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="root"');
  });

  it('falls back to index.html for unknown client routes', async () => {
    const res = await request(app).get('/projects/5');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="root"');
  });

  it('still returns JSON for /api routes', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
