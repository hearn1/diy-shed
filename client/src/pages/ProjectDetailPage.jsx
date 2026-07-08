import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post, put, del, rerunResearch } from '../api/client.js';
import { PRIORITIES, STATUSES, ITEM_TYPES, EFFORT_LEVELS, SKILL_LEVELS, labelFor } from '../constants.js';

const EMPTY_ITEM = { name: '', type: 'tool', est_cost: '' };
const POLL_MS = 4000;

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [items, setItems] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [editingItemId, setEditingItemId] = useState(null);
  const [effort, setEffort] = useState({ effort_level: '', effort_hours: '', skill_level: '' });

  function loadItems() {
    get(`/api/projects/${id}/items`)
      .then(setItems)
      .catch((err) => setError(err.message));
  }

  function loadProject() {
    return get(`/api/projects/${id}`)
      .then((p) => {
        setProject(p);
        setEffort({
          effort_level: p.effort_level ?? '',
          effort_hours: p.effort_hours ?? '',
          skill_level: p.skill_level ?? ''
        });
        loadItems();
      })
      .catch((err) => {
        if (err.message.toLowerCase().includes('not found')) setNotFound(true);
        else setError(err.message);
      });
  }

  useEffect(() => {
    loadProject();
    return () => clearInterval(pollRef.current);
  }, [id]);

  useEffect(() => {
    clearInterval(pollRef.current);
    if (project?.status === 'researching') {
      pollRef.current = setInterval(loadProject, POLL_MS);
    }
    return () => clearInterval(pollRef.current);
  }, [project?.status]);

  function updateItemForm(field, value) {
    setItemForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetItemForm() {
    setItemForm(EMPTY_ITEM);
    setEditingItemId(null);
  }

  function startEditItem(item) {
    setEditingItemId(item.id);
    setItemForm({ name: item.name, type: item.type, est_cost: item.est_cost ?? '' });
  }

  async function submitItem(e) {
    e.preventDefault();
    setError('');
    const payload = {
      name: itemForm.name,
      type: itemForm.type,
      est_cost: itemForm.est_cost === '' ? null : Number(itemForm.est_cost)
    };
    try {
      if (editingItemId) {
        await put(`/api/projects/${id}/items/${editingItemId}`, payload);
      } else {
        await post(`/api/projects/${id}/items`, payload);
      }
      resetItemForm();
      loadItems();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Remove "${item.name}"?`)) return;
    try {
      await del(`/api/projects/${id}/items/${item.id}`);
      if (editingItemId === item.id) resetItemForm();
      loadItems();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveEffort(e) {
    e.preventDefault();
    setError('');
    const payload = {
      effort_level: effort.effort_level || null,
      effort_hours: effort.effort_hours === '' ? null : Number(effort.effort_hours),
      skill_level: effort.skill_level || null
    };
    try {
      const updated = await put(`/api/projects/${id}`, payload);
      setProject((prev) => ({ ...updated, guides: prev?.guides ?? [] }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRerun() {
    if (!window.confirm('Re-run research? This replaces the current research results.')) return;
    setError('');
    try {
      await rerunResearch(id);
      loadProject();
    } catch (err) {
      setError(err.message);
    }
  }

  if (notFound) {
    return (
      <section>
        <h2>Project not found</h2>
        <p>
          <Link to="/">Back to projects</Link>
        </p>
      </section>
    );
  }

  if (!project) {
    return <section>{error ? <p className="error">{error}</p> : <p>Loading…</p>}</section>;
  }

  const tools = items.filter((i) => i.type === 'tool');
  const materials = items.filter((i) => i.type === 'material');

  return (
    <section>
      <div className="actions">
        <h2>{project.name}</h2>
        <Link to={`/projects/${id}/edit`}>Edit</Link>
      </div>
      {project.description && <p>{project.description}</p>}
      <p>
        Priority: {labelFor(PRIORITIES, project.priority)} · Status: {labelFor(STATUSES, project.status)}
      </p>
      {error && <p className="error">{error}</p>}

      <div className="actions">
        <h3>Research</h3>
        {project.status !== 'researching' && (
          <button onClick={handleRerun}>Re-run research</button>
        )}
      </div>
      {project.status === 'researching' ? (
        <p className="research-status">
          <span className="pulse-dots" aria-hidden="true">
            <i></i>
            <i></i>
            <i></i>
          </span>
          Researching guides, tools &amp; cost…
        </p>
      ) : project.status === 'research_failed' ? (
        <p className="error">
          Research failed{project.research_error ? `: ${project.research_error}` : ''}. Use Re-run research to try
          again, or enter tools, materials and effort manually below.
        </p>
      ) : (
        <>
          {project.research_summary && <p>{project.research_summary}</p>}
          {project.effort_level && (
            <p>
              Estimated effort: {project.effort_level}
              {project.effort_hours != null ? ` · ~${project.effort_hours}h` : ''}
              {project.skill_level ? ` · ${project.skill_level}` : ''}
            </p>
          )}
          {project.guides && project.guides.length > 0 && (
            <ul>
              {project.guides.map((g) => (
                <li key={g.id}>
                  <a href={g.url} target="_blank" rel="noopener noreferrer">
                    {g.title}
                  </a>
                  {g.summary ? ` — ${g.summary}` : ''}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <h3>Tools &amp; Materials</h3>
      <ItemGroup title="Tools" items={tools} onEdit={startEditItem} onDelete={deleteItem} />
      <ItemGroup title="Materials" items={materials} onEdit={startEditItem} onDelete={deleteItem} />

      <form onSubmit={submitItem}>
        <label>
          Item name
          <input value={itemForm.name} onChange={(e) => updateItemForm('name', e.target.value)} required />
        </label>
        <label>
          Type
          <select value={itemForm.type} onChange={(e) => updateItemForm('type', e.target.value)}>
            {ITEM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Est. cost
          <input
            type="number"
            value={itemForm.est_cost}
            onChange={(e) => updateItemForm('est_cost', e.target.value)}
          />
        </label>
        <div className="actions">
          <button type="submit" className="primary">
            {editingItemId ? 'Save item' : 'Add item'}
          </button>
          {editingItemId && (
            <button type="button" onClick={resetItemForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <h3>Effort</h3>
      <form onSubmit={saveEffort}>
        <label>
          Effort level
          <select
            value={effort.effort_level}
            onChange={(e) => setEffort((prev) => ({ ...prev, effort_level: e.target.value }))}
          >
            <option value="">—</option>
            {EFFORT_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Effort hours
          <input
            type="number"
            value={effort.effort_hours}
            onChange={(e) => setEffort((prev) => ({ ...prev, effort_hours: e.target.value }))}
          />
        </label>
        <label>
          Skill level
          <select
            value={effort.skill_level}
            onChange={(e) => setEffort((prev) => ({ ...prev, skill_level: e.target.value }))}
          >
            <option value="">—</option>
            {SKILL_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button type="submit" className="primary">
            Save effort
          </button>
        </div>
      </form>
    </section>
  );
}

function ItemGroup({ title, items, onEdit, onDelete }) {
  return (
    <div>
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="empty">None yet.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              {item.name} — {item.est_cost != null ? `$${item.est_cost}` : '—'}
              <span className="actions">
                <button onClick={() => onEdit(item)}>Edit</button>
                <button className="danger" onClick={() => onDelete(item)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
