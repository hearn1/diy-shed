import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout.jsx';
import * as api from '../api/client.js';

vi.mock('../api/client.js');

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Layout', () => {
  it('renders nav links to Projects and Inventory', async () => {
    api.getHealth.mockResolvedValue({ status: 'ok', selectedProvider: 'claude', providers: [] });
    renderLayout();
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/inventory');
  });

  it('shows no banner when a provider is selected', async () => {
    api.getHealth.mockResolvedValue({ status: 'ok', selectedProvider: 'claude', providers: [] });
    renderLayout();
    await waitFor(() => expect(api.getHealth).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a dismissible setup banner when no provider is selected', async () => {
    api.getHealth.mockResolvedValue({ status: 'ok', selectedProvider: null, providers: [] });
    renderLayout();
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(/Finish setting up AI research/i);
    expect(banner).toHaveTextContent(/manually/i);
    expect(screen.getByRole('link', { name: /set up ai research/i })).toHaveAttribute('href', '/setup');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
