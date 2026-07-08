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
});

describe('HomePage', () => {
  it('renders rows from the project list', async () => {
    api.get.mockResolvedValue([
      { id: 1, name: 'Build a shed', priority: 'highly_desired', status: 'ready', effort_level: 'Medium' }
    ]);
    renderPage();
    expect(await screen.findByRole('link', { name: 'Build a shed' })).toBeInTheDocument();
    expect(screen.getByText('Highly Desired')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('shows the empty state for no projects', async () => {
    api.get.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/No projects yet/i)).toBeInTheDocument());
  });

  it('renders a researching project with the progress message', async () => {
    api.get.mockResolvedValue([{ id: 2, name: 'Deck', priority: 'dreams', status: 'researching' }]);
    renderPage();
    expect(await screen.findByText(/Researching guides, tools & cost/i)).toBeInTheDocument();
  });

  it('shows the error and a working Retry on a failed project', async () => {
    api.get.mockResolvedValue([
      { id: 3, name: 'Fence', priority: 'urgent_fix', status: 'research_failed', research_error: 'timeout' }
    ]);
    api.rerunResearch.mockResolvedValue({ id: 3, status: 'researching' });
    renderPage();
    expect(await screen.findByText(/Research failed: timeout/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(api.rerunResearch).toHaveBeenCalledWith(3));
  });
});
