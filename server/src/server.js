import app from './app.js';

export function startServer({ port } = {}) {
  const requested = port ?? process.env.PORT ?? 3000;
  return new Promise((resolve, reject) => {
    const server = app.listen(requested, () => {
      resolve({ server, port: server.address().port });
    });
    server.on('error', reject);
  });
}
