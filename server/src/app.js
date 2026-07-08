import express from 'express';
import projectsRouter from './routes/projects.js';
import inventoryRouter from './routes/inventory.js';

const app = express();

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/projects', projectsRouter);
app.use('/api/inventory', inventoryRouter);

export default app;
