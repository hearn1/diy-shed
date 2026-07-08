import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { get, post, put } from '../api/client.js';
import { PRIORITIES, STATUSES } from '../constants.js';

export default function ProjectFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    name: '',
    description: '',
    priority: 'slightly_desired',
    status: 'ready'
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    get(`/api/projects/${id}`)
      .then((p) =>
        setForm({
          name: p.name,
          description: p.description ?? '',
          priority: p.priority,
          status: p.status
        })
      )
      .catch((err) => setError(err.message));
  }, [id, isEdit]);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      if (isEdit) {
        await put(`/api/projects/${id}`, form);
        navigate(`/projects/${id}`);
      } else {
        const created = await post('/api/projects', form);
        navigate(`/projects/${created.id}`);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <h2>{isEdit ? 'Edit project' : 'New project'}</h2>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSubmit}>
        <label>
          Name
          <input value={form.name} onChange={(e) => update('name', e.target.value)} required />
        </label>
        <label>
          Description
          <textarea
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            rows={4}
          />
        </label>
        <label>
          Priority
          <select value={form.priority} onChange={(e) => update('priority', e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={form.status} onChange={(e) => update('status', e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button type="submit" className="primary">
            {isEdit ? 'Save' : 'Create'}
          </button>
          <button type="button" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
