import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  get,
  post,
  put,
  del,
  rerunResearch,
  markItemOwned,
  unlinkItem,
  getCompletionReview,
  completeProject,
  getSteps,
  addStep,
  updateStep,
  deleteStep,
  moveStep,
  startProject
} from '../api/client.js';
import { PRIORITIES, STATUSES, ITEM_TYPES, EFFORT_LEVELS, SKILL_LEVELS, labelFor } from '../constants.js';
import { looksLikeProviderError } from '../providerMeta.js';

const EMPTY_ITEM = { name: '', type: 'tool', est_cost: '' };
const POLL_MS = 4000;
const RERUN_CONFIRM =
  'Re-run research? This replaces the current research results. ' +
  "Steps you've added or edited, and any step you've already checked off, will be kept. " +
  'Any remaining AI-suggested steps you have not started will be replaced with newly researched ones.';

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
  const [completionTools, setCompletionTools] = useState(null);
  const [checkedTools, setCheckedTools] = useState({});
  const [steps, setSteps] = useState([]);
  const [stepText, setStepText] = useState('');
  const [editingStepId, setEditingStepId] = useState(null);

  function loadItems() {
    get(`/api/projects/${id}/items`)
      .then(setItems)
      .catch((err) => setError(err.message));
  }

  function loadSteps() {
    getSteps(id)
      .then(setSteps)
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
        loadSteps();
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

  async function ownItem(item) {
    setError('');
    try {
      await markItemOwned(id, item.id);
      loadProject();
    } catch (err) {
      setError(err.message);
    }
  }

  async function notOwnedItem(item) {
    setError('');
    try {
      await unlinkItem(id, item.id);
      loadProject();
    } catch (err) {
      setError(err.message);
    }
  }

  async function startCompletion() {
    setError('');
    try {
      const { tools } = await getCompletionReview(id);
      if (tools.length === 0) {
        if (!window.confirm('Mark this project as done?')) return;
        await completeProject(id, []);
        loadProject();
        return;
      }
      setCompletionTools(tools);
      setCheckedTools(Object.fromEntries(tools.map((t) => [t.id, true])));
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleTool(toolId) {
    setCheckedTools((prev) => ({ ...prev, [toolId]: !prev[toolId] }));
  }

  function cancelCompletion() {
    setCompletionTools(null);
    setCheckedTools({});
  }

  async function confirmCompletion() {
    setError('');
    const checkedIds = completionTools.filter((t) => checkedTools[t.id]).map((t) => t.id);
    try {
      await completeProject(id, checkedIds);
      cancelCompletion();
      loadProject();
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
      setProject((prev) => ({ ...updated, guides: prev?.guides ?? [], gap: prev?.gap }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRerun() {
    if (!window.confirm(RERUN_CONFIRM)) return;
    setError('');
    try {
      await rerunResearch(id);
      loadProject();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStartProject() {
    setError('');
    try {
      const updated = await startProject(id);
      setProject((prev) => ({ ...prev, status: updated.status }));
    } catch (err) {
      setError(err.message);
    }
  }

  function resetStepForm() {
    setStepText('');
    setEditingStepId(null);
  }

  function startEditStep(step) {
    setEditingStepId(step.id);
    setStepText(step.text);
  }

  async function submitStep(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingStepId) {
        await updateStep(id, editingStepId, { text: stepText });
      } else {
        await addStep(id, stepText);
      }
      resetStepForm();
      loadSteps();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleStepDone(step) {
    setError('');
    try {
      await updateStep(id, step.id, { done: !step.done });
      loadSteps();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteStep(step) {
    if (!window.confirm(`Remove step "${step.text}"?`)) return;
    setError('');
    try {
      await deleteStep(id, step.id);
      if (editingStepId === step.id) resetStepForm();
      loadSteps();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleMoveStep(step, direction) {
    setError('');
    try {
      const updated = await moveStep(id, step.id, direction);
      setSteps(updated);
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

  const gapById = new Map((project.gap?.items ?? []).map((g) => [g.id, g]));
  const enriched = items.map((i) => ({ ...i, owned: gapById.get(i.id)?.owned ?? false }));
  const tools = enriched.filter((i) => i.type === 'tool');
  const materials = enriched.filter((i) => i.type === 'material');
  const doneStepCount = steps.filter((s) => s.done).length;
  const stepsLocked = project.status === 'done';

  return (
    <section>
      <div className="actions">
        <h2>{project.name}</h2>
        {project.status === 'ready' && <button onClick={handleStartProject}>Start project</button>}
        {project.status !== 'done' && <button onClick={startCompletion}>Mark as done</button>}
        <Link to={`/projects/${id}/edit`}>Edit</Link>
      </div>
      {project.description && <p>{project.description}</p>}
      <p>
        Priority: {labelFor(PRIORITIES, project.priority)} · Status: {labelFor(STATUSES, project.status)}
      </p>
      {error && <p className="error">{error}</p>}

      {completionTools && (
        <div className="completion-review" role="dialog" aria-label="Completion review">
          <p>You used these tools — add them to your inventory?</p>
          <ul className="item-list">
            {completionTools.map((tool) => (
              <li key={tool.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!checkedTools[tool.id]}
                    onChange={() => toggleTool(tool.id)}
                  />
                  {tool.name}
                </label>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button className="primary" onClick={confirmCompletion}>
              Mark done
            </button>
            <button onClick={cancelCompletion}>Cancel</button>
          </div>
        </div>
      )}

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
          {looksLikeProviderError(project.research_error) && (
            <> Check your AI provider in <Link to="/settings">Settings</Link>.</>
          )}
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

      <h3>Execution Steps</h3>
      <p className="step-progress">
        {doneStepCount} of {steps.length} step{steps.length === 1 ? '' : 's'} done
      </p>
      {steps.length === 0 ? (
        <p className="empty">No steps yet.</p>
      ) : (
        <ul className="step-list">
          {steps.map((step, index) => (
            <li key={step.id} className={step.done ? 'step-done' : ''}>
              <input
                type="checkbox"
                checked={!!step.done}
                disabled={stepsLocked}
                onChange={() => toggleStepDone(step)}
                aria-label={`Mark step "${step.text}" done`}
              />
              <span className={`step-badge ${step.source === 'research' ? 'ai' : 'you'}`}>
                {step.source === 'research' ? 'AI' : 'You'}
              </span>
              <span className="step-text">{step.text}</span>
              <span className="actions">
                <button
                  type="button"
                  onClick={() => handleMoveStep(step, 'up')}
                  disabled={index === 0}
                  aria-label="Move step up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => handleMoveStep(step, 'down')}
                  disabled={index === steps.length - 1}
                  aria-label="Move step down"
                >
                  ↓
                </button>
                <button type="button" onClick={() => startEditStep(step)}>
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => handleDeleteStep(step)}>
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submitStep}>
        <label>
          Step text
          <input value={stepText} onChange={(e) => setStepText(e.target.value)} required />
        </label>
        <div className="actions">
          <button type="submit" className="primary">
            {editingStepId ? 'Save step' : 'Add step'}
          </button>
          {editingStepId && (
            <button type="button" onClick={resetStepForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <h3>Tools &amp; Materials</h3>
      {project.gap && (
        <p className="cost-summary">
          {project.gap.missing_count} missing item{project.gap.missing_count === 1 ? '' : 's'} · estimated
          out-of-pocket <strong>${project.gap.est_cost}</strong>
        </p>
      )}
      <ItemGroup
        title="Tools"
        items={tools}
        onEdit={startEditItem}
        onDelete={deleteItem}
        onOwn={ownItem}
        onUnlink={notOwnedItem}
      />
      <ItemGroup
        title="Materials"
        items={materials}
        onEdit={startEditItem}
        onDelete={deleteItem}
        onOwn={ownItem}
        onUnlink={notOwnedItem}
      />

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

function ItemGroup({ title, items, onEdit, onDelete, onOwn, onUnlink }) {
  return (
    <div>
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="empty">None yet.</p>
      ) : (
        <ul className="item-list">
          {items.map((item) => (
            <li key={item.id} className={item.owned ? 'item-owned' : 'item-missing'}>
              <span className={`item-badge ${item.owned ? 'owned' : 'missing'}`}>
                {item.owned ? 'Owned' : 'Missing'}
              </span>
              {item.name} — {item.est_cost != null ? `$${item.est_cost}` : '—'}
              <span className="actions">
                {item.owned ? (
                  <button onClick={() => onUnlink(item)}>Not owned</button>
                ) : (
                  <button onClick={() => onOwn(item)}>I have this</button>
                )}
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
