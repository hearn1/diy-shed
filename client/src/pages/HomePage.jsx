import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getRankedProjects, getSettings, updateSettings, del, rerunResearch } from '../api/client.js';
import { PRIORITIES, PRIORITY_CLASS, EFFORT_LEVELS, labelFor } from '../constants.js';

const POLL_MS = 4000;
const PREVIEW_DEBOUNCE_MS = 175;
const EFFORT_FILL = { Low: 1, Medium: 2, High: 3 };

export default function HomePage() {
  const [projects, setProjects] = useState([]);
  const [wEffort, setWEffort] = useState(0.5);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const pollRef = useRef(null);
  const previewTimer = useRef(null);
  const reqSeq = useRef(0);

  function load(preview) {
    const seq = ++reqSeq.current;
    return getRankedProjects(preview)
      .then((data) => {
        if (seq !== reqSeq.current) return;
        setProjects(data);
        setError('');
      })
      .catch((err) => {
        if (seq === reqSeq.current) setError(err.message);
      });
  }

  useEffect(() => {
    getSettings()
      .then((s) => setWEffort(s.w_effort))
      .catch(() => {});
    load();
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(previewTimer.current);
    };
  }, []);

  useEffect(() => {
    const anyResearching = projects.some((p) => p.status === 'researching');
    clearInterval(pollRef.current);
    if (anyResearching) {
      pollRef.current = setInterval(() => load(), POLL_MS);
    }
    return () => clearInterval(pollRef.current);
  }, [projects]);

  function handleSliderChange(e) {
    const value = Number(e.target.value) / 100;
    setWEffort(value);
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => load(value), PREVIEW_DEBOUNCE_MS);
  }

  function commitWEffort() {
    updateSettings({ w_effort: wEffort }).catch((err) => setError(err.message));
  }

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

  const effortPct = Math.round(wEffort * 100);

  return (
    <section>
      <div className="actions">
        <h2>Projects</h2>
        <button className="primary" onClick={() => navigate('/projects/new')}>
          New project
        </button>
      </div>

      <div className="weight-slider">
        <div className="weight-slider-labels">
          <span>More time than money</span>
          <span>More money than time</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={effortPct}
          aria-label="Effort vs cost weighting"
          onChange={handleSliderChange}
          onMouseUp={commitWEffort}
          onTouchEnd={commitWEffort}
          onKeyUp={commitWEffort}
        />
        <div className="weight-readout">
          {effortPct}% effort · {100 - effortPct}% cost
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {projects.length === 0 ? (
        <p className="empty">No projects yet. Create your first one.</p>
      ) : (
        <ol className="project-cards">
          {projects.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} onDelete={handleDelete} onRetry={handleRetry} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ProjectCard({ project: p, onDelete, onRetry }) {
  if (p.status === 'researching') {
    return (
      <article className="project-card researching">
        <div className="card-rank">{p.rank}</div>
        <div className="card-body">
          <h3>
            <Link to={`/projects/${p.id}`}>{p.name}</Link>
          </h3>
          <p className="research-status">
            <span className="pulse-dots" aria-hidden="true">
              <i></i>
              <i></i>
              <i></i>
            </span>
            Researching guides, tools &amp; cost…
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="project-card">
      <div className="card-rank">{p.rank}</div>
      <div className="card-body">
        <div className="card-head">
          <h3>
            <Link to={`/projects/${p.id}`}>{p.name}</Link>
          </h3>
          <span className={`pill ${PRIORITY_CLASS[p.priority] ?? ''}`}>{labelFor(PRIORITIES, p.priority)}</span>
        </div>
        {p.description && <p className="card-desc">{p.description}</p>}
        {p.status === 'research_failed' && (
          <p className="research-failed">
            <span className="error">Research failed{p.research_error ? `: ${p.research_error}` : ''}</span>
            <button onClick={() => onRetry(p)}>Retry</button>
          </p>
        )}
        <div className="card-meta">
          <EffortBar level={p.effort_level} />
          <span className="missing-count">
            {p.missing_count} missing item{p.missing_count === 1 ? '' : 's'}
          </span>
          <span className="card-cost">${p.est_cost ?? 0}</span>
        </div>
      </div>
      <div className="card-actions actions">
        <Link to={`/projects/${p.id}/edit`}>Edit</Link>
        <button className="danger" onClick={() => onDelete(p)}>
          Delete
        </button>
      </div>
    </article>
  );
}

function EffortBar({ level }) {
  const fill = EFFORT_FILL[level] ?? 0;
  return (
    <span className="effort-bar" title={level ? `Effort: ${labelFor(EFFORT_LEVELS, level)}` : 'Effort: unknown'}>
      {[1, 2, 3].map((n) => (
        <i key={n} className={n <= fill ? 'on' : ''} />
      ))}
      <span className="effort-label">{level || '—'}</span>
    </span>
  );
}
