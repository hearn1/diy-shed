import express from 'express';
import db from '../db/index.js';
import { STATUSES, PRIORITIES, EFFORT_LEVELS, SKILL_LEVELS, isValidEnum } from '../util/validate.js';

const router = express.Router();

function getProject(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at DESC, id DESC').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = getProject(req.params.id);
  if (!row) return res.status(404).json({ error: 'Project not found' });
  res.json(row);
});

router.post('/', (req, res) => {
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
  res.status(201).json(getProject(info.lastInsertRowid));
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
