import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from './SettingsPage.jsx';
import * as api from '../api/client.js';

vi.mock('../api/client.js');

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('SettingsPage', () => {
  it('shows the current provider and its live status', async () => {
    api.getHealth.mockResolvedValue({
      selectedProvider: 'claude',
      providers: [{ id: 'claude', available: true, authenticated: null }]
    });
    renderPage();
    const line = await screen.findByText(/Current provider:/);
    expect(line.closest('p')).toHaveTextContent('Claude Code');
    expect(screen.getAllByText(/Claude Code: Ready/).length).toBeGreaterThan(0);
  });

  it('switches provider and persists on save, updating the shown current provider', async () => {
    api.getHealth.mockResolvedValue({
      selectedProvider: 'claude',
      providers: [
        { id: 'claude', available: true, authenticated: null },
        { id: 'gemini', available: true, authenticated: true }
      ]
    });
    api.setProvider.mockResolvedValue({ ai_provider: 'gemini' });
    renderPage();

    await screen.findByText(/Current provider:/);
    fireEvent.click(screen.getByRole('radio', { name: /Gemini/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save provider/i }));

    await waitFor(() => expect(api.setProvider).toHaveBeenCalledWith('gemini'));
    expect(await screen.findByText(/Provider saved/)).toBeInTheDocument();
    expect(screen.getByText(/Current provider:/).closest('p')).toHaveTextContent('Gemini');
  });

  it('re-tests the connection and reflects a signed-out status', async () => {
    api.getHealth
      .mockResolvedValueOnce({
        selectedProvider: 'gemini',
        providers: [{ id: 'gemini', available: true, authenticated: true }]
      })
      .mockResolvedValueOnce({
        selectedProvider: 'gemini',
        providers: [{ id: 'gemini', available: true, authenticated: false }]
      });
    renderPage();

    await screen.findByText(/Current provider:/);
    fireEvent.click(screen.getByRole('button', { name: /Test connection/i }));

    expect((await screen.findAllByText(/Login with Google/)).length).toBeGreaterThan(0);
  });

  it('can turn research off by saving "Continue without AI"', async () => {
    api.getHealth.mockResolvedValue({
      selectedProvider: 'gemini',
      providers: [{ id: 'gemini', available: true, authenticated: true }]
    });
    api.setProvider.mockResolvedValue({ ai_provider: null });
    renderPage();

    await screen.findByText(/Current provider:/);
    fireEvent.click(screen.getByRole('radio', { name: /Continue without AI/ }));
    fireEvent.click(screen.getByRole('button', { name: /Save provider/i }));

    await waitFor(() => expect(api.setProvider).toHaveBeenCalledWith(null));
    expect(await screen.findByText(/Research turned off/)).toBeInTheDocument();
  });
});
