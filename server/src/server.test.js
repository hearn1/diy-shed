import { describe, it, expect, afterEach } from 'vitest';
import { startServer } from './server.js';

let running;

afterEach(() => {
  if (running) {
    running.server.close();
    running = null;
  }
});

describe('startServer', () => {
  it('binds an OS-assigned port and answers /api/health', async () => {
    running = await startServer({ port: 0 });
    expect(typeof running.port).toBe('number');
    expect(running.port).toBeGreaterThan(0);

    const res = await fetch(`http://localhost:${running.port}/api/health`);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('respects an explicit port argument', async () => {
    running = await startServer({ port: 0 });
    const first = running.port;
    running.server.close();

    running = await startServer({ port: first });
    expect(running.port).toBe(first);
  });
});
