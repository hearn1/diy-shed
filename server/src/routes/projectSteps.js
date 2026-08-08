import express from 'express';
import db from '../db/index.js';

const router = express.Router({ mergeParams: true });

function projectExists(id) {
  return !!db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id);
}

function getProject(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function getStep(projectId, stepId) {
  return db.prepare('SELECT * FROM project_steps WHERE id = ? AND project_id = ?').get(stepId, projectId);
}

function listSteps(projectId) {
  return db.prepare('SELECT * FROM project_steps WHERE project_id = ? ORDER BY position, id').all(projectId);
}

function serialize(row) {
  return { ...row, done: !!row.done };
}

function nextPosition(projectId) {
  const row = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM project_steps WHERE project_id = ?').get(
    projectId
  );
  return row.pos;
}

router.get('/', (req, res) => {
  const { projectId } = req.params;
  if (!projectExists(projectId)) return res.status(404).json({ error: 'Project not found' });
  res.json(listSteps(projectId).map(serialize));
});

router.post('/', (req, res) => {
  const { projectId } = req.params;
  if (!projectExists(projectId)) return res.status(404).json({ error: 'Project not found' });
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'text is required' });

  const info = db
    .prepare("INSERT INTO project_steps (project_id, text, source, position) VALUES (?, ?, 'manual', ?)")
    .run(projectId, text, nextPosition(projectId));
  res.status(201).json(serialize(db.prepare('SELECT * FROM project_steps WHERE id = ?').get(info.lastInsertRowid)));
});

router.put('/:stepId', (req, res) => {
  const { projectId, stepId } = req.params;
  const existing = getStep(projectId, stepId);
  if (!existing) return res.status(404).json({ error: 'Step not found' });

  const body = req.body ?? {};
  const cols = [];
  const vals = [];

  if ('text' in body) {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return res.status(400).json({ error: 'text is required' });
    cols.push('text = ?');
    vals.push(text);
    // Editing an AI-generated step's text makes it the user's from now on, so
    // it is preserved like a manually-added step across future research re-runs.
    if (existing.source === 'research') {
      cols.push("source = 'manual'");
    }
  }

  if ('done' in body) {
    if (typeof body.done !== 'boolean') return res.status(400).json({ error: 'done must be a boolean' });
    const project = getProject(projectId);
    if (project.status === 'done') {
      return res.status(400).json({ error: 'Cannot change steps on a completed project' });
    }
    cols.push('done = ?');
    vals.push(body.done ? 1 : 0);
  }

  if (cols.length > 0) {
    vals.push(stepId);
    db.prepare(`UPDATE project_steps SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
  }
  res.json(serialize(db.prepare('SELECT * FROM project_steps WHERE id = ?').get(stepId)));
});

router.post('/:stepId/move', (req, res) => {
  const { projectId, stepId } = req.params;
  const existing = getStep(projectId, stepId);
  if (!existing) return res.status(404).json({ error: 'Step not found' });

  const direction = req.body?.direction;
  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({ error: 'direction must be "up" or "down"' });
  }

  const ordered = listSteps(projectId);
  const index = ordered.findIndex((s) => s.id === existing.id);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= ordered.length) {
    return res.json(listSteps(projectId).map(serialize));
  }

  const neighbor = ordered[swapIndex];
  const update = db.prepare('UPDATE project_steps SET position = ? WHERE id = ?');
  update.run(neighbor.position, existing.id);
  update.run(existing.position, neighbor.id);

  res.json(listSteps(projectId).map(serialize));
});

router.delete('/:stepId', (req, res) => {
  const { projectId, stepId } = req.params;
  const info = db.prepare('DELETE FROM project_steps WHERE id = ? AND project_id = ?').run(stepId, projectId);
  if (info.changes === 0) return res.status(404).json({ error: 'Step not found' });
  res.status(204).end();
});

export default router;
