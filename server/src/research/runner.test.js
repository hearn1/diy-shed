import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db/index.js';
import { researchProject } from './runner.js';
import { setSelectedProviderId } from './selection.js';

let db;
let dbPath;

function makeProject(name = 'Build a shed', description = 'in the yard') {
  const info = db.prepare('INSERT INTO projects (name, description) VALUES (?, ?)').run(name, description);
  return info.lastInsertRowid;
}

function validResult() {
  return {
    ok: true,
    json: {
      summary: 'Frame it and roof it.',
      effort: { level: 'Medium', hours: 12, skill: 'Intermediate' },
      guides: [{ title: 'Shed 101', url: 'https://example.com/shed', summary: 'overview' }],
      tools: [{ name: 'Circular Saw', est_cost: 120 }],
      materials: [{ name: 'Plywood', est_cost: 40 }],
      steps: ['Mark out the frame', 'Cut the lumber', 'Assemble the walls']
    }
  };
}

function getSteps(projectId) {
  return db.prepare('SELECT * FROM project_steps WHERE project_id = ? ORDER BY position, id').all(projectId);
}

function provider(id, run) {
  return { id, label: id, run, isAvailable: async () => ({ available: true }) };
}

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `diy-shed-runner-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  db = openDb(dbPath);
});

afterEach(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      // ignore
    }
  }
});

describe('researchProject', () => {
  it('persists guides, items, effort, summary and provider and lands ready on success', async () => {
    const id = makeProject();
    const status = await researchProject(id, { db, provider: provider('gemini', async () => validResult()) });
    expect(status).toBe('ready');

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    expect(project.status).toBe('ready');
    expect(project.research_summary).toBe('Frame it and roof it.');
    expect(project.research_provider).toBe('gemini');
    expect(project.effort_level).toBe('Medium');
    expect(project.effort_hours).toBe(12);
    expect(project.skill_level).toBe('Intermediate');
    expect(project.researched_at).toBeTruthy();

    const guides = db.prepare('SELECT * FROM guides WHERE project_id = ?').all(id);
    expect(guides).toHaveLength(1);
    expect(guides[0].url).toBe('https://example.com/shed');

    const items = db.prepare('SELECT * FROM project_items WHERE project_id = ? ORDER BY id').all(id);
    expect(items.map((i) => [i.name, i.type, i.source])).toEqual([
      ['Circular Saw', 'tool', 'research'],
      ['Plywood', 'material', 'research']
    ]);
    expect(items[0].normalized_name).toBe('circular saw');

    const steps = getSteps(id);
    expect(steps.map((s) => [s.text, s.done, s.source, s.position])).toEqual([
      ['Mark out the frame', 0, 'research', 0],
      ['Cut the lumber', 0, 'research', 1],
      ['Assemble the walls', 0, 'research', 2]
    ]);
  });

  it('records research_provider from the stored selection when no provider is injected', async () => {
    const id = makeProject();
    setSelectedProviderId(db, 'claude');
    const status = await researchProject(id, {
      db,
      getProvider: () => provider('claude', async () => validResult())
    });
    expect(status).toBe('ready');
    expect(db.prepare('SELECT research_provider FROM projects WHERE id = ?').get(id).research_provider).toBe('claude');
  });

  it('re-running with a different provider updates research_provider', async () => {
    const id = makeProject();
    await researchProject(id, { db, provider: provider('claude', async () => validResult()) });
    await researchProject(id, { db, provider: provider('gemini', async () => validResult()) });
    expect(db.prepare('SELECT research_provider FROM projects WHERE id = ?').get(id).research_provider).toBe('gemini');
  });

  it('replaces prior research rows on re-run but keeps manual items', async () => {
    const id = makeProject();
    db.prepare(
      "INSERT INTO project_items (project_id, name, normalized_name, type, est_cost, source) VALUES (?,?,?,?,?, 'manual')"
    ).run(id, 'My Hammer', 'my hammer', 'tool', 5);

    const p = provider('claude', async () => validResult());
    await researchProject(id, { db, provider: p });
    await researchProject(id, { db, provider: p });

    const research = db.prepare("SELECT * FROM project_items WHERE project_id = ? AND source='research'").all(id);
    const manual = db.prepare("SELECT * FROM project_items WHERE project_id = ? AND source='manual'").all(id);
    expect(research).toHaveLength(2);
    expect(manual.map((m) => m.name)).toEqual(['My Hammer']);

    const guides = db.prepare('SELECT * FROM guides WHERE project_id = ?').all(id);
    expect(guides).toHaveLength(1);
  });

  it('fails with a "no provider configured" error when nothing is selected', async () => {
    const id = makeProject();
    const status = await researchProject(id, { db });
    expect(status).toBe('research_failed');
    expect(db.prepare('SELECT research_error FROM projects WHERE id = ?').get(id).research_error).toBe(
      'No AI provider configured'
    );
  });

  it('fails with a provider-named error when the selected provider is unavailable (no fallback)', async () => {
    const id = makeProject();
    setSelectedProviderId(db, 'gemini');
    const status = await researchProject(id, {
      db,
      getProvider: () => ({ id: 'gemini', label: 'Gemini', isAvailable: async () => ({ available: false }) })
    });
    expect(status).toBe('research_failed');
    expect(db.prepare('SELECT research_error FROM projects WHERE id = ?').get(id).research_error).toBe(
      'Gemini is not available'
    );
  });

  it('retries exactly once on an invalid response, then fails with the error surfaced', async () => {
    const id = makeProject();
    let calls = 0;
    const p = provider('claude', async () => {
      calls += 1;
      return { ok: true, json: { summary: '' } };
    });
    const status = await researchProject(id, { db, provider: p });
    expect(status).toBe('research_failed');
    expect(calls).toBe(2);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    expect(project.status).toBe('research_failed');
    expect(project.research_error).toBeTruthy();
  });

  it('retries once when the provider run throws', async () => {
    const id = makeProject();
    let calls = 0;
    const p = provider('claude', async () => {
      calls += 1;
      throw new Error('spawn crashed');
    });
    const status = await researchProject(id, { db, provider: p });
    expect(status).toBe('research_failed');
    expect(calls).toBe(2);
    expect(db.prepare('SELECT research_error FROM projects WHERE id = ?').get(id).research_error).toContain(
      'spawn crashed'
    );
  });

  it('marks research_failed with no partial rows when the provider errors', async () => {
    const id = makeProject();
    const p = provider('claude', async () => ({ ok: false, error: 'timeout' }));
    const status = await researchProject(id, { db, provider: p });
    expect(status).toBe('research_failed');
    expect(db.prepare('SELECT COUNT(*) c FROM guides WHERE project_id = ?').get(id).c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) c FROM project_items WHERE project_id = ?').get(id).c).toBe(0);
  });

  it('rolls back the whole transaction on a mid-write error', async () => {
    const id = makeProject();
    const wrapped = {
      prepare: (sql) =>
        sql.includes('INSERT INTO guides')
          ? {
              run: () => {
                throw new Error('disk full');
              }
            }
          : db.prepare(sql),
      transaction: (fn) => db.transaction(fn)
    };
    const status = await researchProject(id, {
      db: wrapped,
      provider: provider('claude', async () => validResult())
    });
    expect(status).toBe('research_failed');

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    expect(project.effort_level).toBeNull();
    expect(project.research_summary).toBeNull();
    expect(db.prepare('SELECT COUNT(*) c FROM guides WHERE project_id = ?').get(id).c).toBe(0);
    expect(db.prepare('SELECT COUNT(*) c FROM project_items WHERE project_id = ?').get(id).c).toBe(0);
  });
});

describe('researchProject execution checklist rerun', () => {
  function insertStep(projectId, { text, done, source, position }) {
    db.prepare('INSERT INTO project_steps (project_id, text, done, source, position) VALUES (?,?,?,?,?)').run(
      projectId,
      text,
      done ? 1 : 0,
      source,
      position
    );
  }

  it('keeps manual, completed, and edited-to-manual steps on rerun; replaces incomplete untouched ones (scenario 7)', async () => {
    const id = makeProject();
    insertStep(id, { text: 'My own prep step', done: false, source: 'manual', position: 0 });
    insertStep(id, { text: 'Mark out the frame', done: true, source: 'research', position: 1 });
    insertStep(id, { text: 'Cut the lumber', done: false, source: 'research', position: 2 });
    insertStep(id, { text: 'Assemble the walls (edited)', done: false, source: 'manual', position: 3 });

    const p = provider('claude', async () => ({
      ok: true,
      json: {
        ...validResult().json,
        steps: ['Mark out the frame', 'Cut the lumber to size', 'Raise the frame', 'Add the roof']
      }
    }));
    const status = await researchProject(id, { db, provider: p });
    expect(status).toBe('ready');

    const steps = getSteps(id);
    expect(steps.map((s) => [s.text, !!s.done, s.source])).toEqual([
      ['My own prep step', false, 'manual'],
      ['Mark out the frame', true, 'research'],
      ['Assemble the walls (edited)', false, 'manual'],
      ['Mark out the frame', false, 'research'],
      ['Cut the lumber to size', false, 'research'],
      ['Raise the frame', false, 'research'],
      ['Add the roof', false, 'research']
    ]);
    expect(steps.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('leaves the checklist byte-for-byte unchanged when a rerun fails', async () => {
    const id = makeProject();
    insertStep(id, { text: 'My own prep step', done: false, source: 'manual', position: 0 });
    insertStep(id, { text: 'Mark out the frame', done: true, source: 'research', position: 1 });
    insertStep(id, { text: 'Cut the lumber', done: false, source: 'research', position: 2 });
    const before = getSteps(id);

    const p = provider('claude', async () => ({ ok: false, error: 'timeout' }));
    const status = await researchProject(id, { db, provider: p });
    expect(status).toBe('research_failed');

    expect(getSteps(id)).toEqual(before);
  });

  it('replaces every step when none were manual or completed', async () => {
    const id = makeProject();
    insertStep(id, { text: 'Old step one', done: false, source: 'research', position: 0 });
    insertStep(id, { text: 'Old step two', done: false, source: 'research', position: 1 });

    const p = provider('claude', async () => validResult());
    await researchProject(id, { db, provider: p });

    const steps = getSteps(id);
    expect(steps.map((s) => s.text)).toEqual(['Mark out the frame', 'Cut the lumber', 'Assemble the walls']);
    expect(steps.every((s) => s.source === 'research' && !s.done)).toBe(true);
  });
});
