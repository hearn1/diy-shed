import { useEffect, useState } from 'react';
import { get, post, put, del } from '../api/client.js';
import { ITEM_TYPES, labelFor } from '../constants.js';

const EMPTY_FORM = { name: '', type: 'tool', quantity: '', notes: '' };

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  function load() {
    get('/api/inventory')
      .then((data) => {
        setItems(data);
        setError('');
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    load();
  }, []);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      type: item.type,
      quantity: item.quantity ?? '',
      notes: item.notes ?? ''
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const payload = {
      name: form.name,
      type: form.type,
      quantity: form.quantity === '' ? null : Number(form.quantity),
      notes: form.notes || null
    };
    try {
      if (editingId) {
        await put(`/api/inventory/${editingId}`, payload);
      } else {
        await post('/api/inventory', payload);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.name}"?`)) return;
    try {
      await del(`/api/inventory/${item.id}`);
      if (editingId === item.id) resetForm();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <h2>Inventory</h2>
      {error && <p className="error">{error}</p>}

      <form onSubmit={handleSubmit}>
        <label>
          Name
          <input value={form.name} onChange={(e) => update('name', e.target.value)} required />
        </label>
        <label>
          Type
          <select value={form.type} onChange={(e) => update('type', e.target.value)}>
            {ITEM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input
            type="number"
            value={form.quantity}
            onChange={(e) => update('quantity', e.target.value)}
          />
        </label>
        <label>
          Notes
          <input value={form.notes} onChange={(e) => update('notes', e.target.value)} />
        </label>
        <div className="actions">
          <button type="submit" className="primary">
            {editingId ? 'Save' : 'Add item'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {items.length === 0 ? (
        <p className="empty">No inventory yet. Add the tools and materials you own.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Quantity</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{labelFor(ITEM_TYPES, item.type)}</td>
                <td>{item.quantity ?? '—'}</td>
                <td>{item.notes || '—'}</td>
                <td className="actions">
                  <button onClick={() => startEdit(item)}>Edit</button>
                  <button className="danger" onClick={() => handleDelete(item)}>
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
