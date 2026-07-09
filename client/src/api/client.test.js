import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get, post, del, rerunResearch, getHealth } from './client.js';

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function okResponse(body) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

describe('api client', () => {
  it('get hits the path with GET and returns parsed JSON', async () => {
    global.fetch.mockResolvedValue(okResponse([{ id: 1 }]));
    const data = await get('/api/projects');
    expect(global.fetch).toHaveBeenCalledWith('/api/projects', expect.objectContaining({ method: 'GET' }));
    expect(data).toEqual([{ id: 1 }]);
  });

  it('post sends a JSON body with the right method and headers', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({ id: 5 }) });
    await post('/api/projects', { name: 'x' });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ name: 'x' });
  });

  it('throws with the server error message on a non-2xx response', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'name is required' })
    });
    await expect(post('/api/projects', {})).rejects.toThrow('name is required');
  });

  it('del returns null on 204', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 204 });
    const result = await del('/api/projects/1');
    expect(result).toBeNull();
  });

  it('rerunResearch POSTs to the project research endpoint', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 202, json: () => Promise.resolve({ id: 7 }) });
    await rerunResearch(7);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/projects/7/research');
    expect(options.method).toBe('POST');
  });

  it('getHealth GETs the health endpoint', async () => {
    global.fetch.mockResolvedValue(okResponse({ status: 'ok', claude: { available: true } }));
    const data = await getHealth();
    expect(global.fetch).toHaveBeenCalledWith('/api/health', expect.objectContaining({ method: 'GET' }));
    expect(data).toEqual({ status: 'ok', claude: { available: true } });
  });
});
