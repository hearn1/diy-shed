import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProjectFormPage from './ProjectFormPage.jsx';
import * as api from '../api/client.js';

vi.mock('../api/client.js');

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ProjectFormPage (create mode)', () => {
  it('submits a POST with the entered payload', async () => {
    api.post.mockResolvedValue({ id: 7 });
    render(
      <MemoryRouter initialEntries={['/projects/new']}>
        <Routes>
          <Route path="/projects/new" element={<ProjectFormPage />} />
          <Route path="/projects/:id" element={<div>detail</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New deck' } });
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'urgent_fix' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/api/projects', {
      name: 'New deck',
      description: '',
      priority: 'urgent_fix',
      status: 'ready'
    });
  });
});
