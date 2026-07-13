import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

let providers;
let availability;
let selectedProvider;

vi.mock('../src/research/providers/index.js', () => ({
  listProviders: () => providers,
  getProviderAvailability: (id) => Promise.resolve(availability[id]),
  getProvider: (id) => providers.find((p) => p.id === id),
  providerIds: ['claude', 'gemini']
}));

vi.mock('../src/research/selection.js', () => ({
  getSelectedProviderId: () => selectedProvider,
  setSelectedProviderId: () => selectedProvider,
  isSelectedProviderAvailable: () => Promise.resolve(false)
}));

const app = (await import('../src/app.js')).default;

beforeEach(() => {
  providers = [
    { id: 'claude', label: 'Claude Code' },
    { id: 'gemini', label: 'Gemini' }
  ];
  availability = {
    claude: { available: true },
    gemini: { available: true, authenticated: true }
  };
  selectedProvider = 'gemini';
});

describe('GET /api/health', () => {
  it('reports per-provider availability, the selection, and a claude mirror', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'ok',
      selectedProvider: 'gemini',
      providers: [
        { id: 'claude', label: 'Claude Code', available: true, authenticated: null, error: null },
        { id: 'gemini', label: 'Gemini', available: true, authenticated: true, error: null }
      ],
      claude: { available: true }
    });
  });

  it('reflects a signed-out / unavailable provider and null selection', async () => {
    selectedProvider = null;
    availability = {
      claude: { available: false, error: 'not installed' },
      gemini: { available: true, authenticated: false }
    };
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.selectedProvider).toBeNull();
    expect(res.body.claude).toEqual({ available: false });
    expect(res.body.providers).toEqual([
      { id: 'claude', label: 'Claude Code', available: false, authenticated: null, error: 'not installed' },
      { id: 'gemini', label: 'Gemini', available: true, authenticated: false, error: null }
    ]);
  });
});
