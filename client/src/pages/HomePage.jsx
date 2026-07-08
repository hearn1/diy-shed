import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, del } from '../api/client.js';
import { PRIORITIES, STATUSES, labelFor } from '../constants.js';

export default function HomePage() {
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  function load() {
    get('/api/projects')
      .then((data) => {
        setProjects(data);
        setError('');
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(project) {
    if (!window.confirm(`Delete "${project.name}"?`)) return;
    try {
      await del(`/api/projects/${project.id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <div className="actions">
        <h2>Projects</h2>
        <button className="primary" onClick={() => navigate('/projects/new')}>
          New project
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {projects.length === 0 ? (
        <p className="empty">No projects yet. Create your first one.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Effort</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/projects/${p.id}`}>{p.name}</Link>
                </td>
                <td>{labelFor(PRIORITIES, p.priority)}</td>
                <td>{labelFor(STATUSES, p.status)}</td>
                <td>{p.effort_level || '—'}</td>
                <td className="actions">
                  <Link to={`/projects/${p.id}/edit`}>Edit</Link>
                  <button className="danger" onClick={() => handleDelete(p)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
