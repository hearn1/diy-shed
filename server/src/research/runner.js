import defaultDb from '../db/index.js';
import { getProvider } from './providers/index.js';
import { getSelectedProviderId } from './selection.js';
import { buildResearchPrompt } from './prompt.js';
import { validateResearchResult } from './schema.js';
import { normalizeName } from '../util/normalize.js';
import { planStepMerge } from '../util/executionSteps.js';

async function attempt(project, provider) {
  const prompt = buildResearchPrompt({ name: project.name, description: project.description });
  let res;
  try {
    res = await provider.run(prompt);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'research failed' };
  const validated = validateResearchResult(res.json);
  if (!validated.ok) return { ok: false, error: validated.errors.join('; ') };
  return { ok: true, value: validated.value };
}

// Resolve the provider to run this research with. A test may inject `deps.provider`
// directly; otherwise the stored selection is used. There is no silent fallback:
// an unset or unavailable selection fails fast to research_failed.
async function resolveProvider(db, deps) {
  if (deps.provider) return { ok: true, provider: deps.provider };
  const id = getSelectedProviderId(db);
  if (!id) return { ok: false, error: 'No AI provider configured' };
  const lookup = deps.getProvider || getProvider;
  const provider = lookup(id);
  if (!provider) return { ok: false, error: `Unknown AI provider: ${id}` };
  const availability = await provider.isAvailable();
  if (!availability || !availability.available) {
    return { ok: false, error: `${provider.label} is not available` };
  }
  return { ok: true, provider };
}

function fail(db, projectId, error) {
  db.prepare("UPDATE projects SET status = 'research_failed', research_error = ? WHERE id = ?").run(error, projectId);
  return 'research_failed';
}

// Research replaces only research-sourced rows: it deletes and reinserts
// project_items with source='research' and all guides for the project. Rows the
// user added manually (source='manual') and any inventory_id links are left
// untouched.
export async function researchProject(projectId, deps = {}) {
  const db = deps.db || defaultDb;

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return 'research_failed';

  db.prepare("UPDATE projects SET status = 'researching', research_error = NULL WHERE id = ?").run(projectId);

  const resolved = await resolveProvider(db, deps);
  if (!resolved.ok) return fail(db, projectId, resolved.error);
  const { provider } = resolved;

  let result = await attempt(project, provider);
  if (!result.ok) result = await attempt(project, provider);

  if (!result.ok) return fail(db, projectId, result.error);

  const { summary, effort, guides, tools, materials, steps } = result.value;
  const persist = db.transaction(() => {
    db.prepare(
      `UPDATE projects
         SET status = 'ready',
             research_summary = ?,
             research_provider = ?,
             effort_level = ?,
             effort_hours = ?,
             skill_level = ?,
             researched_at = datetime('now'),
             research_error = NULL
       WHERE id = ?`
    ).run(summary, provider.id, effort.level, effort.hours, effort.skill, projectId);

    db.prepare('DELETE FROM guides WHERE project_id = ?').run(projectId);
    const insertGuide = db.prepare('INSERT INTO guides (project_id, title, url, summary) VALUES (?,?,?,?)');
    for (const g of guides) insertGuide.run(projectId, g.title, g.url, g.summary);

    db.prepare("DELETE FROM project_items WHERE project_id = ? AND source = 'research'").run(projectId);
    const insertItem = db.prepare(
      "INSERT INTO project_items (project_id, name, normalized_name, type, est_cost, source) VALUES (?,?,?,?,?, 'research')"
    );
    for (const t of tools) insertItem.run(projectId, t.name, normalizeName(t.name), 'tool', t.est_cost);
    for (const m of materials) insertItem.run(projectId, m.name, normalizeName(m.name), 'material', m.est_cost);

    const existingSteps = db
      .prepare('SELECT * FROM execution_steps WHERE project_id = ? ORDER BY position, id')
      .all(projectId);
    const { removeIds, toInsert } = planStepMerge(existingSteps, steps);
    if (removeIds.length) {
      const placeholders = removeIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM execution_steps WHERE id IN (${placeholders})`).run(...removeIds);
    }
    const insertStep = db.prepare(
      "INSERT INTO execution_steps (project_id, text, done, source, position) VALUES (?,?,0,'research',?)"
    );
    for (const s of toInsert) insertStep.run(projectId, s.text, s.position);
  });

  try {
    persist();
  } catch (err) {
    return fail(db, projectId, err.message);
  }
  return 'ready';
}
