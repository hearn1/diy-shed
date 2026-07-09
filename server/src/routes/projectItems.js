import express from 'express';
import db from '../db/index.js';
import { normalizeName } from '../util/normalize.js';
import { ITEM_TYPES, MATCH_OVERRIDES, isValidEnum } from '../util/validate.js';
import { ownProjectItem } from '../util/ownership.js';

const router = express.Router({ mergeParams: true });

function projectExists(id) {
  return !!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id);
}

function getItem(projectId, itemId) {
  return db.prepare('SELECT * FROM project_items WHERE id = ? AND project_id = ?').get(itemId, projectId);
}

router.get('/', (req, res) => {
  const { projectId } = req.params;
  if (!projectExists(projectId)) return res.status(404).json({ error: 'Project not found' });
  const rows = db.prepare('SELECT * FROM project_items WHERE project_id = ? ORDER BY id').all(projectId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { projectId } = req.params;
  if (!projectExists(projectId)) return res.status(404).json({ error: 'Project not found' });
  const { name, type, est_cost } = req.body ?? {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!isValidEnum(type, ITEM_TYPES)) {
    return res.status(400).json({ error: 'type must be tool or material' });
  }
  const info = db
    .prepare('INSERT INTO project_items (project_id, name, normalized_name, type, est_cost) VALUES (?,?,?,?,?)')
    .run(projectId, name, normalizeName(name), type, est_cost ?? null);
  res.status(201).json(db.prepare('SELECT * FROM project_items WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:itemId', (req, res) => {
  const { projectId, itemId } = req.params;
  const existing = getItem(projectId, itemId);
  if (!existing) return res.status(404).json({ error: 'Item not found' });

  const body = req.body ?? {};
  const cols = [];
  const vals = [];
  if ('name' in body) {
    if (typeof body.name !== 'string' || body.name.trim() === '') {
      return res.status(400).json({ error: 'name is required' });
    }
    cols.push('name = ?', 'normalized_name = ?');
    vals.push(body.name, normalizeName(body.name));
  }
  if ('type' in body) {
    if (!isValidEnum(body.type, ITEM_TYPES)) {
      return res.status(400).json({ error: 'type must be tool or material' });
    }
    cols.push('type = ?');
    vals.push(body.type);
  }
  if ('est_cost' in body) {
    cols.push('est_cost = ?');
    vals.push(body.est_cost);
  }
  if ('inventory_id' in body) {
    const value = body.inventory_id;
    if (value === null) {
      cols.push('inventory_id = ?');
      vals.push(null);
    } else if (typeof value !== 'number' || !db.prepare('SELECT 1 FROM inventory WHERE id = ?').get(value)) {
      return res.status(400).json({ error: 'invalid inventory_id' });
    } else {
      cols.push('inventory_id = ?');
      vals.push(value);
    }
  }
  if ('match_override' in body) {
    if (!isValidEnum(body.match_override, MATCH_OVERRIDES)) {
      return res.status(400).json({ error: 'invalid match_override' });
    }
    cols.push('match_override = ?');
    vals.push(body.match_override);
  }
  if (cols.length > 0) {
    vals.push(itemId);
    db.prepare(`UPDATE project_items SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(db.prepare('SELECT * FROM project_items WHERE id = ?').get(itemId));
});

router.post('/:itemId/own', (req, res) => {
  const { projectId, itemId } = req.params;
  const item = getItem(projectId, itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  const inventory = ownProjectItem(item);
  const updated = db.prepare('SELECT * FROM project_items WHERE id = ?').get(itemId);
  res.json({ item: updated, inventory });
});

router.post('/:itemId/unlink', (req, res) => {
  const { projectId, itemId } = req.params;
  const item = getItem(projectId, itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  db.prepare("UPDATE project_items SET inventory_id = NULL, match_override = 'ignore' WHERE id = ?").run(itemId);
  res.json(db.prepare('SELECT * FROM project_items WHERE id = ?').get(itemId));
});

router.delete('/:itemId', (req, res) => {
  const { projectId, itemId } = req.params;
  const info = db.prepare('DELETE FROM project_items WHERE id = ? AND project_id = ?').run(itemId, projectId);
  if (info.changes === 0) return res.status(404).json({ error: 'Item not found' });
  res.status(204).end();
});

export default router;
