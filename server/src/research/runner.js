import defaultDb from '../db/index.js';
import { runClaude as defaultRunClaude } from './claudeCli.js';
import { buildResearchPrompt } from './prompt.js';
import { validateResearchResult } from './schema.js';
import { normalizeName } from '../util/normalize.js';

async function attempt(project, runClaude) {
  const prompt = buildResearchPrompt({ name: project.name, description: project.description });
  let res;
  try {
    res = await runClaude(prompt);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'research failed' };
  const validated = validateResearchResult(res.json);
  if (!validated.ok) return { ok: false, error: validated.errors.join('; ') };
  return { ok: true, value: validated.value };
}

// Research replaces only research-sourced rows: it deletes and reinserts
// project_items with source='research' and all guides for the project. Rows the
// user added manually (source='manual') and any inventory_id links are left
// untouched.
export async function researchProject(projectId, deps = {}) {
  const db = deps.db || defaultDb;
  const runClaude = deps.runClaude || defaultRunClaude;

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return 'research_failed';

  db.prepare("UPDATE projects SET status = 'researching', research_error = NULL WHERE id = ?").run(projectId);

  let result = await attempt(project, runClaude);
  if (!result.ok) result = await attempt(project, runClaude);

  if (!result.ok) {
    db.prepare("UPDATE projects SET status = 'research_failed', research_error = ? WHERE id = ?").run(
      result.error,
      projectId
    );
    return 'research_failed';
  }

  const { summary, effort, guides, tools, materials } = result.value;
  const persist = db.transaction(() => {
    db.prepare(
      `UPDATE projects
         SET status = 'ready',
             research_summary = ?,
             effort_level = ?,
             effort_hours = ?,
             skill_level = ?,
             researched_at = datetime('now'),
             research_error = NULL
       WHERE id = ?`
    ).run(summary, effort.level, effort.hours, effort.skill, projectId);

    db.prepare('DELETE FROM guides WHERE project_id = ?').run(projectId);
    const insertGuide = db.prepare('INSERT INTO guides (project_id, title, url, summary) VALUES (?,?,?,?)');
    for (const g of guides) insertGuide.run(projectId, g.title, g.url, g.summary);

    db.prepare("DELETE FROM project_items WHERE project_id = ? AND source = 'research'").run(projectId);
    const insertItem = db.prepare(
      "INSERT INTO project_items (project_id, name, normalized_name, type, est_cost, source) VALUES (?,?,?,?,?, 'research')"
    );
    for (const t of tools) insertItem.run(projectId, t.name, normalizeName(t.name), 'tool', t.est_cost);
    for (const m of materials) insertItem.run(projectId, m.name, normalizeName(m.name), 'material', m.est_cost);
  });

  try {
    persist();
  } catch (err) {
    db.prepare("UPDATE projects SET status = 'research_failed', research_error = ? WHERE id = ?").run(
      err.message,
      projectId
    );
    return 'research_failed';
  }
  return 'ready';
}
