import { useEffect, useState } from 'react';
import { get } from '../api/client.js';

export default function HomePage() {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    get('/api/projects')
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  return (
    <section>
      <h2>Projects</h2>
      <p>{projects.length} project(s).</p>
    </section>
  );
}
