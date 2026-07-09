import express from 'express';
import db from '../db/index.js';

const router = express.Router();

function readWEffort() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'w_effort'").get();
  const w = row ? Number(row.value) : 0.5;
  return Number.isFinite(w) ? w : 0.5;
}

function payload() {
  const w_effort = readWEffort();
  return { w_effort, w_cost: 1 - w_effort };
}

router.get('/', (req, res) => {
  res.json(payload());
});

router.put('/', (req, res) => {
  const { w_effort } = req.body ?? {};
  if (typeof w_effort !== 'number' || !Number.isFinite(w_effort) || w_effort < 0 || w_effort > 1) {
    return res.status(400).json({ error: 'w_effort must be a number between 0 and 1' });
  }
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('w_effort', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(String(w_effort));
  res.json(payload());
});

export default router;
