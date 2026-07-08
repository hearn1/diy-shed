import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import projectsRouter from './routes/projects.js';
import inventoryRouter from './routes/inventory.js';
import projectItemsRouter from './routes/projectItems.js';
import { isClaudeAvailable } from './research/claudeCli.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const app = express();

app.use(express.json());

app.get('/api/health', async (req, res) => {
  const available = await isClaudeAvailable();
  res.json({ status: 'ok', claude: { available } });
});

app.use('/api/projects', projectsRouter);
app.use('/api/projects/:projectId/items', projectItemsRouter);
app.use('/api/inventory', inventoryRouter);

const distDir = process.env.DIYSHED_CLIENT_DIST
  ? path.resolve(process.env.DIYSHED_CLIENT_DIST)
  : path.join(repoRoot, 'client', 'dist');

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

export default app;
