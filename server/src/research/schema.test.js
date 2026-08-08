import { describe, it, expect } from 'vitest';
import { validateResearchResult } from './schema.js';

function validPayload() {
  return {
    summary: '  Frame it, sheathe it, roof it.  ',
    effort: { level: 'Medium', hours: 12, skill: 'Intermediate' },
    guides: [
      { title: ' Shed 101 ', url: 'https://example.com/shed', summary: ' overview ' },
      { title: 'Roofing', url: 'http://example.com/roof', summary: 'roof' }
    ],
    tools: [{ name: ' Circular Saw ', est_cost: 120 }],
    materials: [
      { name: 'Plywood', est_cost: 40 },
      { name: 'Screws', est_cost: null }
    ],
    steps: [' Frame the walls ', 'Sheathe the roof']
  };
}

describe('validateResearchResult', () => {
  it('accepts a valid payload and returns a trimmed, normalized value', () => {
    const res = validateResearchResult(validPayload());
    expect(res.ok).toBe(true);
    expect(res.value.summary).toBe('Frame it, sheathe it, roof it.');
    expect(res.value.effort).toEqual({ level: 'Medium', hours: 12, skill: 'Intermediate' });
    expect(res.value.guides[0]).toEqual({
      title: 'Shed 101',
      url: 'https://example.com/shed',
      summary: 'overview'
    });
    expect(res.value.tools).toEqual([{ name: 'Circular Saw', est_cost: 120 }]);
    expect(res.value.materials).toEqual([
      { name: 'Plywood', est_cost: 40 },
      { name: 'Screws', est_cost: null }
    ]);
    expect(res.value.steps).toEqual(['Frame the walls', 'Sheathe the roof']);
  });

  it('defaults steps to an empty array when the provider omits them', () => {
    const payload = validPayload();
    delete payload.steps;
    const res = validateResearchResult(payload);
    expect(res.ok).toBe(true);
    expect(res.value.steps).toEqual([]);
  });

  it('rejects a non-empty-string entry in steps', () => {
    const payload = validPayload();
    payload.steps = ['Do the thing', '  '];
    const res = validateResearchResult(payload);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('steps'))).toBe(true);
  });

  it('rejects steps that is not an array', () => {
    const payload = validPayload();
    payload.steps = 'do it';
    const res = validateResearchResult(payload);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes('steps'))).toBe(true);
  });

  it('drops unknown fields from the normalized value', () => {
    const payload = { ...validPayload(), bogus: 'nope' };
    const res = validateResearchResult(payload);
    expect(res.ok).toBe(true);
    expect(res.value).not.toHaveProperty('bogus');
  });

  const cases = [
    ['missing summary', (p) => (p.summary = '')],
    ['invalid effort level', (p) => (p.effort.level = 'Extreme')],
    ['invalid skill', (p) => (p.effort.skill = 'Wizard')],
    ['negative hours', (p) => (p.effort.hours = -1)],
    ['non-URL guide', (p) => (p.guides[0].url = 'not a url')],
    ['ftp guide url', (p) => (p.guides[0].url = 'ftp://example.com/x')],
    ['too many guides', (p) => (p.guides = Array(6).fill({ title: 't', url: 'https://e.com', summary: 's' }))],
    ['empty guides', (p) => (p.guides = [])],
    ['negative tool cost', (p) => (p.tools[0].est_cost = -5)],
    ['tools not an array', (p) => (p.tools = 'saw')],
    ['materials not an array', (p) => (p.materials = null)],
    ['nameless tool', (p) => (p.tools[0].name = '  ')]
  ];

  for (const [label, mutate] of cases) {
    it(`rejects: ${label}`, () => {
      const payload = validPayload();
      mutate(payload);
      const res = validateResearchResult(payload);
      expect(res.ok).toBe(false);
      expect(Array.isArray(res.errors)).toBe(true);
      expect(res.errors.length).toBeGreaterThan(0);
    });
  }

  it('rejects a non-object result', () => {
    expect(validateResearchResult(null).ok).toBe(false);
    expect(validateResearchResult('nope').ok).toBe(false);
    expect(validateResearchResult([]).ok).toBe(false);
  });
});
