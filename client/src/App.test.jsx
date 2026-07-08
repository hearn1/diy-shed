import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';

vi.mock('./api/client.js', () => ({
  get: vi.fn(() => Promise.resolve([]))
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
