import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProviderPicker from './ProviderPicker.jsx';

describe('ProviderPicker', () => {
  it('renders Gemini (recommended, free), Claude, and a continue-without-AI card', () => {
    render(<ProviderPicker selected={null} onSelect={() => {}} />);
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    expect(screen.getByText(/Recommended - Free/i)).toBeInTheDocument();
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('Continue without AI')).toBeInTheDocument();
  });

  it('reports the picked provider id', () => {
    const onSelect = vi.fn();
    render(<ProviderPicker selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Gemini'));
    expect(onSelect).toHaveBeenCalledWith('gemini');
  });

  it('marks the selected card via aria-checked', () => {
    render(<ProviderPicker selected="claude" onSelect={() => {}} />);
    const claude = screen.getByRole('radio', { name: /Claude Code/ });
    expect(claude).toHaveAttribute('aria-checked', 'true');
  });

  it('can hide the continue-without-AI card', () => {
    render(<ProviderPicker selected={null} onSelect={() => {}} includeNone={false} />);
    expect(screen.queryByText('Continue without AI')).not.toBeInTheDocument();
  });
});
