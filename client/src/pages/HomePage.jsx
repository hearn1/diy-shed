import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, del, rerunResearch } from '../api/client.js';
import { PRIORITIES, STATUSES, labelFor } from '../constants.js';

const POLL_MS = 4000;

export default function HomePage() {
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const pollRef = useRef(null);

  function load() {
    return get('/api/projects')
      .then((data) => {
        setProjects(data);
        setError('');
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    const anyResearching = projects.some((p) => p.status === 'researching');
    clearInterval(pollRef.current);
    if (anyResearching) {
      pollRef.current = setInterval(load, POLL_MS);
    }
    return () => clearInterval(pollRef.current);
  }, [projects]);

  async function handleDelete(project) {
    if (!window.confirm(`Delete "${project.name}"?`)) return;
    try {
      await del(`/api/projects/${project.id}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRetry(project) {
    try {
      await rerunResearch(project.id);
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
              <tr key={p.id} className={p.status === 'researching' ? 'researching' : undefined}>
                <td>
                  <Link to={`/projects/${p.id}`}>{p.name}</Link>
                </td>
                <td>{labelFor(PRIORITIES, p.priority)}</td>
                <td>
                  {p.status === 'researching' ? (
                    <span className="research-status">
                      <span className="pulse-dots" aria-hidden="true">
                        <i></i>
                        <i></i>
                        <i></i>
                      </span>
                      Researching guides, tools &amp; cost…
                    </span>
                  ) : p.status === 'research_failed' ? (
                    <span className="research-failed">
                      <span className="error">Research failed{p.research_error ? `: ${p.research_error}` : ''}</span>
                      <button onClick={() => handleRetry(p)}>Retry</button>
                    </span>
                  ) : (
                    labelFor(STATUSES, p.status)
                  )}
                </td>
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
