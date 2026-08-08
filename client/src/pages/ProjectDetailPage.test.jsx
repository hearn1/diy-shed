import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  skill_level: 'Intermediate',
  research_summary: 'Frame it, sheathe it, roof it.',
  guides: [{ id: 5, title: 'Shed 101', url: 'https://example.com/shed', summary: 'overview' }],
  gap: {
    est_cost: 40,
    missing_count: 1,
    items: [
      { id: 10, name: 'Circular Saw', type: 'tool', est_cost: 120, owned: true, matched_inventory_id: 7 },
      { id: 11, name: 'Plywood', type: 'material', est_cost: 40, owned: false, matched_inventory_id: null }
    ]
  }
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
  api.getSteps.mockResolvedValue([]);
});

describe('ProjectDetailPage', () => {
  it('renders the tools/materials and effort sections', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Build a shed' })).toBeInTheDocument();
    expect(screen.getByText(/Circular Saw/)).toBeInTheDocument();
    expect(screen.getByText(/Plywood/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Effort' })).toBeInTheDocument();
  });

  it('distinguishes owned vs missing items and shows the cost summary', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    const saw = screen.getByText(/Circular Saw/).closest('li');
    const plywood = screen.getByText(/Plywood/).closest('li');
    expect(saw).toHaveClass('item-owned');
    expect(saw.querySelector('.item-badge')).toHaveTextContent('Owned');
    expect(plywood).toHaveClass('item-missing');
    expect(plywood.querySelector('.item-badge')).toHaveTextContent('Missing');

    expect(screen.getByText(/1 missing item/)).toBeInTheDocument();
    expect(screen.getByText('$40')).toBeInTheDocument();
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

  it('marks a missing item owned via "I have this"', async () => {
    let owned = false;
    api.markItemOwned.mockImplementation(() => {
      owned = true;
      return Promise.resolve({});
    });
    api.get.mockImplementation((path) => {
      if (path === '/api/projects/1') {
        const items = project.gap.items.map((i) => (i.id === 11 ? { ...i, owned } : i));
        return Promise.resolve({ ...project, gap: { ...project.gap, items, missing_count: owned ? 0 : 1 } });
      }
      if (path === '/api/projects/1/items')
        return Promise.resolve([
          { id: 10, name: 'Circular Saw', type: 'tool', est_cost: 120 },
          { id: 11, name: 'Plywood', type: 'material', est_cost: 40 }
        ]);
      return Promise.resolve([]);
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    const plywood = screen.getByText(/Plywood/).closest('li');
    expect(plywood).toHaveClass('item-missing');
    fireEvent.click(within(plywood).getByRole('button', { name: 'I have this' }));

    await waitFor(() => expect(api.markItemOwned).toHaveBeenCalledWith('1', 11));
    await waitFor(() => expect(screen.getByText(/Plywood/).closest('li')).toHaveClass('item-owned'));
  });

  it('unlinks an owned item via "Not owned"', async () => {
    let unlinked = false;
    api.unlinkItem.mockImplementation(() => {
      unlinked = true;
      return Promise.resolve({});
    });
    api.get.mockImplementation((path) => {
      if (path === '/api/projects/1') {
        const items = project.gap.items.map((i) => (i.id === 10 ? { ...i, owned: !unlinked } : i));
        return Promise.resolve({ ...project, gap: { ...project.gap, items } });
      }
      if (path === '/api/projects/1/items')
        return Promise.resolve([
          { id: 10, name: 'Circular Saw', type: 'tool', est_cost: 120 },
          { id: 11, name: 'Plywood', type: 'material', est_cost: 40 }
        ]);
      return Promise.resolve([]);
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    const saw = screen.getByText(/Circular Saw/).closest('li');
    expect(saw).toHaveClass('item-owned');
    fireEvent.click(within(saw).getByRole('button', { name: 'Not owned' }));

    await waitFor(() => expect(api.unlinkItem).toHaveBeenCalledWith('1', 10));
    await waitFor(() => expect(screen.getByText(/Circular Saw/).closest('li')).toHaveClass('item-missing'));
  });

  it('opens a pre-checked completion modal and completes with the checked tools', async () => {
    let done = false;
    api.getCompletionReview.mockResolvedValue({ tools: [{ id: 10, name: 'Circular Saw', est_cost: 120 }] });
    api.completeProject.mockImplementation(() => {
      done = true;
      return Promise.resolve({});
    });
    api.get.mockImplementation((path) => {
      if (path === '/api/projects/1') return Promise.resolve({ ...project, status: done ? 'done' : 'ready' });
      return Promise.resolve([]);
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
    await waitFor(() => expect(api.getCompletionReview).toHaveBeenCalledWith('1'));

    const dialog = await screen.findByRole('dialog', { name: 'Completion review' });
    const checkbox = within(dialog).getByRole('checkbox');
    expect(checkbox).toBeChecked();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(api.completeProject).toHaveBeenCalledWith('1', [10]));
    await waitFor(() => expect(screen.getByText(/Status: Done/)).toBeInTheDocument());
  });

  it('omits an unchecked tool from the completion payload', async () => {
    api.getCompletionReview.mockResolvedValue({ tools: [{ id: 10, name: 'Circular Saw', est_cost: 120 }] });
    api.completeProject.mockResolvedValue({});
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
    const dialog = await screen.findByRole('dialog', { name: 'Completion review' });
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark done' }));

    await waitFor(() => expect(api.completeProject).toHaveBeenCalledWith('1', []));
  });

  it('marks done directly when there are no unowned tools', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.getCompletionReview.mockResolvedValue({ tools: [] });
    api.completeProject.mockResolvedValue({});
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    fireEvent.click(screen.getByRole('button', { name: 'Mark as done' }));
    await waitFor(() => expect(api.completeProject).toHaveBeenCalledWith('1', []));
    expect(screen.queryByRole('dialog', { name: 'Completion review' })).not.toBeInTheDocument();
  });

  it('shows a friendly message when the project is missing', async () => {
    api.get.mockImplementation(() => Promise.reject(new Error('Project not found')));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Project not found' })).toBeInTheDocument();
  });

  it('renders research summary, effort estimate and a guide link that opens in a new tab', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });
    expect(screen.getByText('Frame it, sheathe it, roof it.')).toBeInTheDocument();
    expect(screen.getByText(/Estimated effort: Medium/)).toBeInTheDocument();
    const guide = screen.getByRole('link', { name: 'Shed 101' });
    expect(guide).toHaveAttribute('href', 'https://example.com/shed');
    expect(guide).toHaveAttribute('target', '_blank');
    expect(guide).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('confirms and calls the re-run endpoint', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.rerunResearch.mockResolvedValue({ id: 1, status: 'researching' });
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    fireEvent.click(screen.getByRole('button', { name: 'Re-run research' }));
    await waitFor(() => expect(api.rerunResearch).toHaveBeenCalledWith('1'));
  });

  it('shows researching messaging and hides re-run while researching', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/api/projects/1') return Promise.resolve({ ...project, status: 'researching' });
      return Promise.resolve([]);
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });
    expect(screen.getByText(/Researching guides, tools & cost/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Re-run research' })).not.toBeInTheDocument();
  });

  it('shows the failure message when research failed', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/api/projects/1')
        return Promise.resolve({ ...project, status: 'research_failed', research_error: 'timeout' });
      return Promise.resolve([]);
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });
    expect(screen.getByText(/Research failed: timeout/i)).toBeInTheDocument();
  });
});

describe('ProjectDetailPage execution steps checklist', () => {
  it('renders steps with progress, AI/You badges and an empty state when there are none', async () => {
    api.getSteps.mockResolvedValue([]);
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });
    expect(screen.getByRole('heading', { name: 'Checklist' })).toBeInTheDocument();
    expect(screen.getByText(/No steps yet/)).toBeInTheDocument();
  });

  it('shows progress across done and not-done steps and labels their source', async () => {
    api.getSteps.mockResolvedValue([
      { id: 1, text: 'Measure twice', done: 1, source: 'research', position: 0 },
      { id: 2, text: 'Cut once', done: 0, source: 'research', position: 1 },
      { id: 3, text: 'My own step', done: 0, source: 'manual', position: 2 }
    ]);
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });
    expect(screen.getByText('1 of 3 done')).toBeInTheDocument();
    const aiStep = screen.getByText('Measure twice').closest('li');
    expect(within(aiStep).getByText('AI')).toBeInTheDocument();
    const userStep = screen.getByText('My own step').closest('li');
    expect(within(userStep).getByText('You')).toBeInTheDocument();
  });

  it('adds a manual step via the checklist form', async () => {
    api.getSteps.mockResolvedValue([]);
    api.addStep.mockResolvedValue({ id: 1, text: 'Buy screws', done: 0, source: 'manual', position: 0 });
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    fireEvent.change(screen.getByLabelText('Step'), { target: { value: 'Buy screws' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));

    await waitFor(() => expect(api.addStep).toHaveBeenCalledWith('1', 'Buy screws'));
  });

  it('checks a step done and persists the toggle', async () => {
    let done = false;
    api.getSteps.mockImplementation(() =>
      Promise.resolve([{ id: 1, text: 'Sand the edges', done, source: 'manual', position: 0 }])
    );
    api.updateStep.mockImplementation((projectId, stepId, payload) => {
      done = payload.done;
      return Promise.resolve({});
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    fireEvent.click(screen.getByRole('checkbox', { name: /Sand the edges/ }));
    await waitFor(() => expect(api.updateStep).toHaveBeenCalledWith('1', 1, { done: true }));
    await waitFor(() => expect(screen.getByText('1 of 1 done')).toBeInTheDocument());
  });

  it('edits a step through the shared form', async () => {
    api.getSteps.mockResolvedValue([{ id: 1, text: 'Old text', done: 0, source: 'research', position: 0 }]);
    api.updateStep.mockResolvedValue({});
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    const step = screen.getByText('Old text').closest('li');
    fireEvent.click(within(step).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Step'), { target: { value: 'New text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }));

    await waitFor(() => expect(api.updateStep).toHaveBeenCalledWith('1', 1, { text: 'New text' }));
  });

  it('deletes a step after confirming', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.getSteps.mockResolvedValue([{ id: 1, text: 'Unwanted step', done: 0, source: 'manual', position: 0 }]);
    api.deleteStep.mockResolvedValue(null);
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    const step = screen.getByText('Unwanted step').closest('li');
    fireEvent.click(within(step).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteStep).toHaveBeenCalledWith('1', 1));
  });

  it('moves a step up via the reorder controls', async () => {
    api.getSteps.mockResolvedValue([
      { id: 1, text: 'First', done: 0, source: 'manual', position: 0 },
      { id: 2, text: 'Second', done: 0, source: 'manual', position: 1 }
    ]);
    api.moveStep.mockResolvedValue([
      { id: 2, text: 'Second', done: 0, source: 'manual', position: 0 },
      { id: 1, text: 'First', done: 0, source: 'manual', position: 1 }
    ]);
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    const second = screen.getByText('Second').closest('li');
    fireEvent.click(within(second).getByRole('button', { name: 'Move step up' }));

    await waitFor(() => expect(api.moveStep).toHaveBeenCalledWith('1', 2, 'up'));
  });

  it('shows a Start project button for a ready project and moves it to in_progress', async () => {
    api.startProject.mockResolvedValue({ ...project, status: 'in_progress' });
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    fireEvent.click(screen.getByRole('button', { name: 'Start project' }));
    await waitFor(() => expect(api.startProject).toHaveBeenCalledWith('1'));
    await waitFor(() => expect(screen.getByText(/Status: In Progress/)).toBeInTheDocument());
  });

  it('hides the Start project button once the project is no longer ready', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/api/projects/1') return Promise.resolve({ ...project, status: 'in_progress' });
      return Promise.resolve([]);
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });
    expect(screen.queryByRole('button', { name: 'Start project' })).not.toBeInTheDocument();
  });
});
