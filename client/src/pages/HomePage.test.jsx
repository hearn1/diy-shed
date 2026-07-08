import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
});
