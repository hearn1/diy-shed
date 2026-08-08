import express from 'express';
import db from '../db/index.js';
import { STATUSES, PRIORITIES, EFFORT_LEVELS, SKILL_LEVELS, isValidEnum } from '../util/validate.js';
import { enqueue } from '../research/queue.js';
import { researchProject } from '../research/runner.js';
import { isSelectedProviderAvailable } from '../research/selection.js';
import { analyzeProjectGap, itemIsOwned } from '../ranking/gap.js';
import { rankProjects } from '../ranking/score.js';
import { ownProjectItem } from '../util/ownership.js';

const router = express.Router();

function getProject(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function getGuides(projectId) {
  return db.prepare('SELECT * FROM guides WHERE project_id = ? ORDER BY id').all(projectId);
}

function startResearch(id) {
  db.prepare("UPDATE projects SET status = 'researching', research_error = NULL WHERE id = ?").run(id);
  enqueue(() => researchProject(id)).catch(() => {});
}

function storedWEffort() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'w_effort'").get();
  const w = row ? Number(row.value) : 0.5;
  return Number.isFinite(w) ? w : 0.5;
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC, id DESC').all();
  res.json(rows);
});

router.get('/ranked', (req, res) => {
  const projects = db.prepare("SELECT * FROM projects WHERE status != 'done'").all();
  const withCost = projects.map((p) => {
    const { est_cost, missing_count } = analyzeProjectGap(p.id, db);
    return { ...p, est_cost, missing_count };
  });

  let wEffort = storedWEffort();
  const override = Number(req.query.w_effort);
  if (req.query.w_effort !== undefined && Number.isFinite(override) && override >= 0 && override <= 1) {
    wEffort = override;
  }

  res.json(rankProjects(withCost, wEffort));
});

function buildProjectResponse(row) {
  const analyzed = analyzeProjectGap(row.id, db);
  const gap = {
    est_cost: analyzed.est_cost,
    missing_count: analyzed.missing_count,
    items: analyzed.items.map((i) => ({
      id: i.id,
      name: i.name,
      type: i.type,
      est_cost: i.est_cost,
      owned: i.owned,
      matched_inventory_id: i.matched_inventory_id
    }))
  };
  return { ...row, guides: getGuides(row.id), gap };
}

router.get('/:id', (req, res) => {
  const row = getProject(req.params.id);
  if (!row) return res.status(404).json({ error: 'Project not found' });
  res.json(buildProjectResponse(row));
});

router.get('/:id/completion-review', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const analyzed = analyzeProjectGap(project.id, db);
  const tools = analyzed.items
    .filter((i) => i.type === 'tool' && !i.owned)
    .map((i) => ({ id: i.id, name: i.name, est_cost: i.est_cost }));
  res.json({ tools });
});

router.post('/:id/start', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (project.status !== 'ready') {
    return res.status(400).json({ error: 'Only a ready project can be started' });
  }
  db.prepare("UPDATE projects SET status = 'in_progress' WHERE id = ?").run(project.id);
  res.json(buildProjectResponse(getProject(project.id)));
});

router.post('/:id/complete', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const addItemIds = req.body?.add_item_ids ?? [];
  if (!Array.isArray(addItemIds)) {
    return res.status(400).json({ error: 'add_item_ids must be an array' });
  }
  const items = [];
  for (const itemId of addItemIds) {
    const item = db.prepare('SELECT * FROM project_items WHERE id = ? AND project_id = ?').get(itemId, project.id);
    if (!item || item.type !== 'tool') {
      return res.status(400).json({ error: 'add_item_ids must reference tools of this project' });
    }
    items.push(item);
  }
  db.transaction(() => {
    const inventory = db.prepare('SELECT * FROM inventory').all();
    for (const item of items) {
      if (itemIsOwned(item, inventory).owned) continue;
      ownProjectItem(item);
    }
    db.prepare("UPDATE projects SET status = 'done' WHERE id = ?").run(project.id);
  })();
  res.json(buildProjectResponse(getProject(project.id)));
});

router.post('/', async (req, res) => {
  const { name, description, priority, status } = req.body ?? {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (priority !== undefined && !isValidEnum(priority, PRIORITIES)) {
    return res.status(400).json({ error: 'invalid priority' });
  }
  if (status !== undefined && !isValidEnum(status, STATUSES)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  const cols = ['name'];
  const vals = [name];
  if (description !== undefined) {
    cols.push('description');
    vals.push(description);
  }
  if (priority !== undefined) {
    cols.push('priority');
    vals.push(priority);
  }
  if (status !== undefined) {
    cols.push('status');
    vals.push(status);
  }
  const placeholders = cols.map(() => '?').join(', ');
  const info = db
    .prepare(`INSERT INTO projects (${cols.join(', ')}) VALUES (${placeholders})`)
    .run(...vals);
  const id = info.lastInsertRowid;

  // Research is skipped for manual/test creation (an explicit status or
  // ?research=false) and when no provider is configured or the selected one is
  // unavailable — the project then stays a normal, manually-editable row.
  // Otherwise it kicks off asynchronously and the 201 returns immediately.
  const researchOptOut = status !== undefined || req.query.research === 'false';
  if (!researchOptOut && (await isSelectedProviderAvailable(db))) {
    startResearch(id);
  }
  res.status(201).json(getProject(id));
});

router.post('/:id/research', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  startResearch(project.id);
  res.status(202).json(getProject(project.id));
});

const UPDATABLE = {
  name: null,
  description: null,
  status: STATUSES,
  priority: PRIORITIES,
  effort_level: EFFORT_LEVELS,
  effort_hours: null,
  skill_level: SKILL_LEVELS
};

router.put('/:id', (req, res) => {
  const existing = getProject(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  const body = req.body ?? {};
  const cols = [];
  const vals = [];
  for (const [key, allowed] of Object.entries(UPDATABLE)) {
    if (!(key in body)) continue;
    const value = body[key];
    if (allowed && value !== null && !isValidEnum(value, allowed)) {
      return res.status(400).json({ error: `invalid ${key}` });
    }
    if (key === 'name' && (typeof value !== 'string' || value.trim() === '')) {
      return res.status(400).json({ error: 'name is required' });
    }
    cols.push(`${key} = ?`);
    vals.push(value);
  }
  if (cols.length > 0) {
    vals.push(req.params.id);
    db.prepare(`UPDATE projects SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(getProject(req.params.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Project not found' });
  res.status(204).end();
});

export default router;
