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
  it('renders nav links to Projects, Inventory, and Settings', async () => {
    api.getHealth.mockResolvedValue({
      selectedProvider: 'gemini',
      providers: [{ id: 'gemini', available: true, authenticated: true }]
    });
    renderLayout();
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Inventory' })).toHaveAttribute('href', '/inventory');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
  });

  it('shows no banner when the selected provider is available and authed', async () => {
    api.getHealth.mockResolvedValue({
      selectedProvider: 'gemini',
      providers: [{ id: 'gemini', available: true, authenticated: true }]
    });
    renderLayout();
    await waitFor(() => expect(api.getHealth).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a dismissible setup banner when no provider is selected', async () => {
    api.getHealth.mockResolvedValue({ selectedProvider: null, providers: [] });
    renderLayout();
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(/Finish setting up AI research/i);
    expect(screen.getByRole('link', { name: /set up ai research/i })).toHaveAttribute('href', '/setup');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('shows a provider-specific not-installed banner (no hard-coded Claude string for Gemini)', async () => {
    api.getHealth.mockResolvedValue({
      selectedProvider: 'gemini',
      providers: [{ id: 'gemini', available: false, authenticated: null }]
    });
    renderLayout();
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(/Gemini is not installed/i);
    expect(banner).toHaveTextContent(/Login with Google/i);
    expect(banner).not.toHaveTextContent(/Claude Code CLI not found/i);
    expect(screen.getByRole('link', { name: /open settings/i })).toHaveAttribute('href', '/settings');
  });

  it('shows a signed-out banner for the selected provider', async () => {
    api.getHealth.mockResolvedValue({
      selectedProvider: 'gemini',
      providers: [{ id: 'gemini', available: true, authenticated: false }]
    });
    renderLayout();
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent(/Sign in to Gemini/i);
    expect(banner).toHaveTextContent(/Login with Google/i);
  });
});
