import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';

vi.mock('./api/client.js', () => ({
  get: vi.fn(() => Promise.resolve([])),
  getHealth: vi.fn(() => Promise.resolve({ status: 'ok', claude: { available: true } })),
  getRankedProjects: vi.fn(() => Promise.resolve([])),
  getSettings: vi.fn(() => Promise.resolve({ w_effort: 0.5, w_cost: 0.5 }))
}));

describe('App', () => {
  it('renders the diy-shed header', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'diy-shed' })).toBeInTheDocument();
  });
});
