import { describe, it, expect } from 'vitest';
import { buildResearchPrompt } from './prompt.js';

describe('buildResearchPrompt', () => {
  it('embeds the project name and description', () => {
    const prompt = buildResearchPrompt({ name: 'Build a shed', description: 'in the back yard' });
    expect(prompt).toContain('Build a shed');
    expect(prompt).toContain('in the back yard');
  });

  it('names the JSON schema keys and asks for a single JSON object', () => {
    const prompt = buildResearchPrompt({ name: 'x', description: 'y' });
    expect(prompt).toMatch(/JSON/);
    for (const key of ['summary', 'effort', 'guides', 'tools', 'materials', 'steps']) {
      expect(prompt).toContain(`"${key}"`);
    }
    expect(prompt).toMatch(/"Low"/);
    expect(prompt).toMatch(/"Beginner"/);
  });

  it('asks for an ordered step-by-step checklist', () => {
    const prompt = buildResearchPrompt({ name: 'x', description: 'y' });
    expect(prompt).toMatch(/ordered/i);
    expect(prompt).toMatch(/step-by-step/i);
  });

  it('handles a missing description without leaving it blank', () => {
    const prompt = buildResearchPrompt({ name: 'x', description: '' });
    expect(prompt).toContain('(no description provided)');
  });
});
