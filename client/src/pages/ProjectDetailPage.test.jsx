import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProjectDetailPage from './ProjectDetailPage.jsx';
import * as api from '../api/client.js';

vi.mock('../api/client.js');

const project = {
  id: 1,
  name: 'Build a shed',
  description: 'in the yard',
  priority: 'highly_desired',
  status: 'ready',
  effort_level: 'Medium',
  effort_hours: 8,
  skill_level: 'Intermediate'
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/projects/1']}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.get.mockImplementation((path) => {
    if (path === '/api/projects/1') return Promise.resolve(project);
    if (path === '/api/projects/1/items')
      return Promise.resolve([
        { id: 10, name: 'Circular Saw', type: 'tool', est_cost: 120 },
        { id: 11, name: 'Plywood', type: 'material', est_cost: 40 }
      ]);
    return Promise.resolve([]);
  });
});

describe('ProjectDetailPage', () => {
  it('renders the tools/materials and effort sections', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Build a shed' })).toBeInTheDocument();
    expect(screen.getByText(/Circular Saw/)).toBeInTheDocument();
    expect(screen.getByText(/Plywood/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Effort' })).toBeInTheDocument();
  });

  it('posts a new item to the items endpoint', async () => {
    api.post.mockResolvedValue({ id: 12 });
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Screws' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'material' } });
    fireEvent.change(screen.getByLabelText('Est. cost'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/api/projects/1/items', {
      name: 'Screws',
      type: 'material',
      est_cost: 5
    });
  });

  it('saves effort via the project PUT', async () => {
    api.put.mockResolvedValue({ ...project, effort_level: 'High' });
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    fireEvent.change(screen.getByLabelText('Effort level'), { target: { value: 'High' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save effort' }));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put).toHaveBeenCalledWith('/api/projects/1', {
      effort_level: 'High',
      effort_hours: 8,
      skill_level: 'Intermediate'
    });
  });

  it('shows a friendly message when the project is missing', async () => {
    api.get.mockImplementation(() => Promise.reject(new Error('Project not found')));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Project not found' })).toBeInTheDocument();
  });
});
