import express from 'express';
import db from '../db/index.js';
import { normalizeName } from '../util/normalize.js';
import { ITEM_TYPES, isValidEnum } from '../util/validate.js';

const router = express.Router();

function getItem(id) {
  return db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM inventory ORDER BY created_at DESC, id DESC').all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = getItem(req.params.id);
  if (!row) return res.status(404).json({ error: 'Inventory item not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { name, type, quantity, notes } = req.body ?? {};
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!isValidEnum(type, ITEM_TYPES)) {
    return res.status(400).json({ error: 'type must be tool or material' });
  }
  const info = db
    .prepare('INSERT INTO inventory (name, normalized_name, type, quantity, notes) VALUES (?,?,?,?,?)')
    .run(name, normalizeName(name), type, quantity ?? null, notes ?? null);
  res.status(201).json(getItem(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = getItem(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Inventory item not found' });

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
  if ('quantity' in body) {
    cols.push('quantity = ?');
    vals.push(body.quantity);
  }
  if ('notes' in body) {
    cols.push('notes = ?');
    vals.push(body.notes);
  }
  if (cols.length > 0) {
    vals.push(req.params.id);
    db.prepare(`UPDATE inventory SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(getItem(req.params.id));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM inventory WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Inventory item not found' });
  res.status(204).end();
});

export default router;
