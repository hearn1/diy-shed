import express from 'express';
import db from '../db/index.js';

const router = express.Router({ mergeParams: true });

function getProject(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function getStep(projectId, stepId) {
  return db.prepare('SELECT * FROM project_steps WHERE id = ? AND project_id = ?').get(stepId, projectId);
}

function listSteps(projectId) {
  return db.prepare('SELECT * FROM project_steps WHERE project_id = ? ORDER BY position, id').all(projectId);
}

function nextPosition(projectId) {
  const row = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM project_steps WHERE project_id = ?')
    .get(projectId);
  return row.maxPos + 1;
}

router.get('/', (req, res) => {
  const { projectId } = req.params;
  if (!getProject(projectId)) return res.status(404).json({ error: 'Project not found' });
  res.json(listSteps(projectId));
});

router.post('/', (req, res) => {
  const { projectId } = req.params;
  if (!getProject(projectId)) return res.status(404).json({ error: 'Project not found' });
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'text is required' });
  const info = db
    .prepare("INSERT INTO project_steps (project_id, text, done, source, position) VALUES (?,?,0,'manual',?)")
    .run(projectId, text, nextPosition(projectId));
  res.status(201).json(db.prepare('SELECT * FROM project_steps WHERE id = ?').get(info.lastInsertRowid));
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
    // Editing an AI-generated step's text makes it the user's own from then on,
    // so it is preserved across research reruns exactly like a manual step.
    if (existing.source === 'research' && text !== existing.text) {
      cols.push('source = ?');
      vals.push('manual');
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
  res.json(db.prepare('SELECT * FROM project_steps WHERE id = ?').get(stepId));
});

router.post('/:stepId/move', (req, res) => {
  const { projectId, stepId } = req.params;
  const step = getStep(projectId, stepId);
  if (!step) return res.status(404).json({ error: 'Step not found' });
  const direction = req.body?.direction;
  if (direction !== 'up' && direction !== 'down') {
    return res.status(400).json({ error: 'direction must be "up" or "down"' });
  }

  const steps = listSteps(projectId);
  const index = steps.findIndex((s) => s.id === step.id);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex >= 0 && swapIndex < steps.length) {
    const other = steps[swapIndex];
    db.transaction(() => {
      db.prepare('UPDATE project_steps SET position = ? WHERE id = ?').run(other.position, step.id);
      db.prepare('UPDATE project_steps SET position = ? WHERE id = ?').run(step.position, other.id);
    })();
  }
  res.json(listSteps(projectId));
});

router.delete('/:stepId', (req, res) => {
  const { projectId, stepId } = req.params;
  const info = db.prepare('DELETE FROM project_steps WHERE id = ? AND project_id = ?').run(stepId, projectId);
  if (info.changes === 0) return res.status(404).json({ error: 'Step not found' });
  res.status(204).end();
});

export default router;
