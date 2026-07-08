import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const isClaudeAvailable = vi.fn();
vi.mock('../src/research/claudeCli.js', () => ({
  isClaudeAvailable: () => isClaudeAvailable()
}));

const app = (await import('../src/app.js')).default;

beforeEach(() => {
  isClaudeAvailable.mockReset();
});

describe('GET /api/health', () => {
  it('reports claude available:true when the CLI is present', async () => {
    isClaudeAvailable.mockResolvedValue(true);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', claude: { available: true } });
  });

  it('reports claude available:false when the CLI is absent', async () => {
    isClaudeAvailable.mockResolvedValue(false);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', claude: { available: false } });
  });
});
