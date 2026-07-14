import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage.jsx';
import * as api from '../api/client.js';

vi.mock('../api/client.js');

function renderPage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getSettings.mockResolvedValue({ w_effort: 0.5, w_cost: 0.5 });
  api.updateSettings.mockResolvedValue({ w_effort: 0.5, w_cost: 0.5 });
});

describe('HomePage', () => {
  it('renders ranked cards in the order returned by getRankedProjects', async () => {
    api.getRankedProjects.mockResolvedValue([
      { id: 2, name: 'Fix roof', priority: 'urgent_fix', status: 'ready', effort_level: 'Low', rank: 1, missing_count: 2, est_cost: 60 },
      { id: 1, name: 'Dream deck', priority: 'dreams', status: 'ready', effort_level: 'High', rank: 2, missing_count: 5, est_cost: 800 }
    ]);
    renderPage();

    const links = await screen.findAllByRole('link', { name: /Fix roof|Dream deck/ });
    expect(links.map((l) => l.textContent)).toEqual(['Fix roof', 'Dream deck']);
    expect(screen.getByText('Urgent Fix')).toBeInTheDocument();
    expect(screen.getByText('2 missing items')).toBeInTheDocument();
    expect(screen.getByText('$60')).toBeInTheDocument();
  });

  it('initializes the slider from getSettings', async () => {
    api.getRankedProjects.mockResolvedValue([]);
    api.getSettings.mockResolvedValue({ w_effort: 0.8, w_cost: 0.2 });
    renderPage();
    await waitFor(() => expect(screen.getByText('80% effort · 20% cost')).toBeInTheDocument());
  });

  it('re-fetches with the preview w_effort while dragging and persists on release', async () => {
    api.getRankedProjects.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(api.getRankedProjects).toHaveBeenCalled());

    const slider = screen.getByLabelText('Effort vs cost weighting');
    fireEvent.change(slider, { target: { value: '75' } });
    await waitFor(() => expect(api.getRankedProjects).toHaveBeenCalledWith(0.75));

    fireEvent.mouseUp(slider);
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ w_effort: 0.75 }));
  });

  it('shows the empty state for no projects', async () => {
    api.getRankedProjects.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/No projects yet/i)).toBeInTheDocument());
  });

  it('renders a researching project with the progress message', async () => {
    api.getRankedProjects.mockResolvedValue([
      { id: 2, name: 'Deck', priority: 'dreams', status: 'researching', rank: 1 }
    ]);
    renderPage();
    expect(await screen.findByText(/Researching guides, tools & cost/i)).toBeInTheDocument();
  });

  it('shows the error and a working Retry on a failed project', async () => {
    api.getRankedProjects.mockResolvedValue([
      { id: 3, name: 'Fence', priority: 'urgent_fix', status: 'research_failed', research_error: 'timeout', rank: 1, missing_count: 0, est_cost: 0 }
    ]);
    api.rerunResearch.mockResolvedValue({ id: 3, status: 'researching' });
    renderPage();
    expect(await screen.findByText(/Research failed: timeout/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(api.rerunResearch).toHaveBeenCalledWith(3));
  });

  it('points to Settings when a failure looks provider-related, but not for a plain timeout', async () => {
    api.getRankedProjects.mockResolvedValue([
      { id: 3, name: 'Fence', priority: 'urgent_fix', status: 'research_failed', research_error: 'Gemini is not available', rank: 1, missing_count: 0, est_cost: 0 },
      { id: 4, name: 'Gate', priority: 'urgent_fix', status: 'research_failed', research_error: 'timeout', rank: 2, missing_count: 0, est_cost: 0 }
    ]);
    renderPage();
    const settingsLink = await screen.findByRole('link', { name: 'Settings' });
    expect(settingsLink).toHaveAttribute('href', '/settings');
    expect(screen.getAllByRole('link', { name: 'Settings' })).toHaveLength(1);
  });
});
