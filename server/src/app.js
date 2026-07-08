import express from 'express';
import projectsRouter from './routes/projects.js';
import inventoryRouter from './routes/inventory.js';
import projectItemsRouter from './routes/projectItems.js';

const app = express();

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/projects', projectsRouter);
app.use('/api/projects/:projectId/items', projectItemsRouter);
app.use('/api/inventory', inventoryRouter);

export default app;
