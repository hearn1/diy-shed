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

describe('ProjectDetailPage execution steps', () => {
  const stepsFixture = [
    { id: 1, project_id: 1, text: 'Mark out the frame', done: 1, source: 'research', position: 0 },
    { id: 2, project_id: 1, text: 'Cut the lumber', done: 0, source: 'research', position: 1 },
    { id: 3, project_id: 1, text: 'Buy extra screws', done: 0, source: 'manual', position: 2 }
  ];

  beforeEach(() => {
    api.getSteps.mockResolvedValue(stepsFixture);
  });

  it('renders steps in order with progress and AI/You badges', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });

    expect(await screen.findByText('1 of 3 steps done')).toBeInTheDocument();
    const items = screen.getAllByText(/Mark out the frame|Cut the lumber|Buy extra screws/);
    expect(items.map((el) => el.textContent)).toEqual(['Mark out the frame', 'Cut the lumber', 'Buy extra screws']);

    const first = screen.getByText('Mark out the frame').closest('li');
    expect(within(first).getByText('AI')).toBeInTheDocument();
    const third = screen.getByText('Buy extra screws').closest('li');
    expect(within(third).getByText('You')).toBeInTheDocument();
  });

  it('adds a manual step via the form', async () => {
    api.addStep.mockResolvedValue({ id: 4, text: 'Sand the edges', done: 0, source: 'manual', position: 3 });
    renderPage();
    await screen.findByText('1 of 3 steps done');

    fireEvent.change(screen.getByLabelText('Step text'), { target: { value: 'Sand the edges' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));

    await waitFor(() => expect(api.addStep).toHaveBeenCalledWith('1', 'Sand the edges'));
  });

  it('edits a step and saves the new text', async () => {
    api.updateStep.mockResolvedValue({ ...stepsFixture[1], text: 'Cut lumber to size' });
    renderPage();
    await screen.findByText('1 of 3 steps done');

    const li = screen.getByText('Cut the lumber').closest('li');
    fireEvent.click(within(li).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Step text'), { target: { value: 'Cut lumber to size' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save step' }));

    await waitFor(() => expect(api.updateStep).toHaveBeenCalledWith('1', 2, { text: 'Cut lumber to size' }));
  });

  it('checks and unchecks a step', async () => {
    api.updateStep.mockResolvedValue({});
    renderPage();
    await screen.findByText('1 of 3 steps done');

    const li = screen.getByText('Cut the lumber').closest('li');
    fireEvent.click(within(li).getByRole('checkbox'));
    await waitFor(() => expect(api.updateStep).toHaveBeenCalledWith('1', 2, { done: true }));

    const done = screen.getByText('Mark out the frame').closest('li');
    fireEvent.click(within(done).getByRole('checkbox'));
    await waitFor(() => expect(api.updateStep).toHaveBeenCalledWith('1', 1, { done: false }));
  });

  it('deletes a step after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.deleteStep.mockResolvedValue(null);
    renderPage();
    await screen.findByText('1 of 3 steps done');

    const li = screen.getByText('Buy extra screws').closest('li');
    fireEvent.click(within(li).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(api.deleteStep).toHaveBeenCalledWith('1', 3));
  });

  it('moves a step up and reflects the returned order', async () => {
    const reordered = [stepsFixture[1], stepsFixture[0], stepsFixture[2]];
    api.moveStep.mockResolvedValue(reordered);
    renderPage();
    await screen.findByText('1 of 3 steps done');

    const li = screen.getByText('Cut the lumber').closest('li');
    fireEvent.click(within(li).getByRole('button', { name: 'Move step up' }));

    await waitFor(() => expect(api.moveStep).toHaveBeenCalledWith('1', 2, 'up'));
    const texts = await screen.findAllByText(/Mark out the frame|Cut the lumber|Buy extra screws/);
    expect(texts.map((el) => el.textContent)).toEqual(['Cut the lumber', 'Mark out the frame', 'Buy extra screws']);
  });

  it('shows a Start project button only when the project is ready, and starts it', async () => {
    api.startProject.mockResolvedValue({ status: 'in_progress' });
    renderPage();
    await screen.findByText('1 of 3 steps done');

    fireEvent.click(screen.getByRole('button', { name: 'Start project' }));
    await waitFor(() => expect(api.startProject).toHaveBeenCalledWith('1'));
    await waitFor(() => expect(screen.getByText(/Status: In Progress/)).toBeInTheDocument());
  });

  it('does not show a Start project button once the project is in progress', async () => {
    api.get.mockImplementation((path) => {
      if (path === '/api/projects/1') return Promise.resolve({ ...project, status: 'in_progress' });
      return Promise.resolve([]);
    });
    renderPage();
    await screen.findByRole('heading', { name: 'Build a shed' });
    expect(screen.queryByRole('button', { name: 'Start project' })).not.toBeInTheDocument();
  });
});
