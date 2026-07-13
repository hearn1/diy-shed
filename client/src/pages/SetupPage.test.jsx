import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SetupPage from './SetupPage.jsx';
import * as api from '../api/client.js';

vi.mock('../api/client.js');

function renderPage() {
  return render(
    <MemoryRouter>
      <SetupPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('SetupPage', () => {
  it('renders the provider picker', () => {
    renderPage();
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('Continue without AI')).toBeInTheDocument();
  });

  it('persists the selection and advances when the connection tests green', async () => {
    api.getHealth.mockResolvedValue({
      selectedProvider: null,
      providers: [{ id: 'gemini', available: true, authenticated: true }]
    });
    api.setProvider.mockResolvedValue({ ai_provider: 'gemini' });
    renderPage();

    fireEvent.click(screen.getByText('Gemini'));
    fireEvent.click(screen.getByRole('button', { name: /Test connection/i }));

    await waitFor(() => expect(api.setProvider).toHaveBeenCalledWith('gemini'));
    expect(await screen.findByText(/start adding projects/i)).toBeInTheDocument();
  });

  it('blocks completion and shows the fix hint when the provider is signed out', async () => {
    api.getHealth.mockResolvedValue({
      selectedProvider: null,
      providers: [{ id: 'gemini', available: true, authenticated: false }]
    });
    renderPage();

    fireEvent.click(screen.getByText('Gemini'));
    fireEvent.click(screen.getByRole('button', { name: /Test connection/i }));

    expect(await screen.findByText(/Login with Google/)).toBeInTheDocument();
    expect(api.setProvider).not.toHaveBeenCalled();
    expect(screen.queryByText(/start adding projects/i)).not.toBeInTheDocument();
  });

  it('surfaces a failed health check without persisting', async () => {
    api.getHealth.mockRejectedValue(new Error('network down'));
    renderPage();

    fireEvent.click(screen.getByText('Claude Code'));
    fireEvent.click(screen.getByRole('button', { name: /Test connection/i }));

    expect(await screen.findByText(/network down/)).toBeInTheDocument();
    expect(api.setProvider).not.toHaveBeenCalled();
  });

  it('lets the user continue without AI without selecting a provider', () => {
    renderPage();
    fireEvent.click(screen.getByText('Continue without AI'));
    expect(screen.getByRole('button', { name: /^Continue without AI$/ })).toBeInTheDocument();
    expect(api.setProvider).not.toHaveBeenCalled();
  });
});
