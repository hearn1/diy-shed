import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InventoryPage from './InventoryPage.jsx';
import * as api from '../api/client.js';

vi.mock('../api/client.js');

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('InventoryPage', () => {
  it('renders the item list', async () => {
    api.get.mockResolvedValue([
      { id: 1, name: 'Cordless Drill', type: 'tool', quantity: 2, notes: 'garage' }
    ]);
    render(<InventoryPage />);
    expect(await screen.findByText('Cordless Drill')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Tool' })).toBeInTheDocument();
  });

  it('submits the add form with the right payload', async () => {
    api.get.mockResolvedValue([]);
    api.post.mockResolvedValue({ id: 3 });
    render(<InventoryPage />);
    await screen.findByText(/No inventory yet/i);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Hammer' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'tool' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/api/inventory', {
      name: 'Hammer',
      type: 'tool',
      quantity: 1,
      notes: null
    });
  });

  it('deletes an item', async () => {
    api.get.mockResolvedValue([{ id: 5, name: 'Saw', type: 'tool', quantity: null, notes: null }]);
    api.del.mockResolvedValue(null);
    render(<InventoryPage />);
    await screen.findByText('Saw');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(api.del).toHaveBeenCalledWith('/api/inventory/5'));
  });
});
