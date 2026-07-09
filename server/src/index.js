import './env.js';
import { startServer } from './server.js';

startServer().then(({ port }) => {
  console.log(`diy-shed server listening on http://localhost:${port}`);
});
