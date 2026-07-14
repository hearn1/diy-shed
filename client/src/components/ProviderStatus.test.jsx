import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProviderStatus from './ProviderStatus.jsx';

describe('ProviderStatus', () => {
  it('shows a ready state with no fix hint', () => {
    render(<ProviderStatus entry={{ id: 'gemini', available: true, authenticated: true }} providerId="gemini" />);
    expect(screen.getByText(/Gemini: Ready/)).toBeInTheDocument();
    expect(screen.getByText(/ready to research/i)).toBeInTheDocument();
  });

  it('shows the signed-out fix hint', () => {
    render(<ProviderStatus entry={{ id: 'gemini', available: true, authenticated: false }} providerId="gemini" />);
    expect(screen.getByText(/Signed out/)).toBeInTheDocument();
    expect(screen.getByText(/Login with Google/)).toBeInTheDocument();
  });

  it('shows the not-installed fix hint', () => {
    render(<ProviderStatus entry={{ id: 'claude', available: false }} providerId="claude" />);
    expect(screen.getByText(/Not installed/)).toBeInTheDocument();
    expect(screen.getByText(/on your PATH/)).toBeInTheDocument();
  });
});
