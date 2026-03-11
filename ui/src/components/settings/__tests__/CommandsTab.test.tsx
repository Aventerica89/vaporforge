import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandsTab } from '../CommandsTab';
import { configApi, pluginsApi } from '@/lib/api';

// Mock the API modules
vi.mock('@/lib/api', () => ({
  configApi: {
    list: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
  pluginsApi: {
    list: vi.fn(),
  },
}));

describe('CommandsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: empty commands, no plugins
    vi.mocked(configApi.list).mockResolvedValue({
      success: true,
      data: [],
    });
    vi.mocked(pluginsApi.list).mockResolvedValue({
      success: true,
      data: [],
    });
  });

  it('shows empty state when no commands exist', async () => {
    render(<CommandsTab />);

    await waitFor(() => {
      expect(screen.getByText('No commands yet')).toBeInTheDocument();
    });
  });

  it('shows add command button', async () => {
    render(<CommandsTab />);

    // Add Command button is always visible (not gated by session)
    expect(screen.getByText(/add command/i)).toBeInTheDocument();
  });

  it('loads existing commands on mount', async () => {
    vi.mocked(configApi.list).mockResolvedValue({
      success: true,
      data: [
        { filename: 'review.md', content: '# Review\n\nReview code', enabled: true },
        { filename: 'test.md', content: '# Test\n\nGenerate tests', enabled: true },
      ],
    });

    render(<CommandsTab />);

    await waitFor(() => {
      expect(screen.getByText('/review')).toBeInTheDocument();
      expect(screen.getByText('/test')).toBeInTheDocument();
    });
  });

  it('opens add command form when button clicked', async () => {
    const user = userEvent.setup();
    render(<CommandsTab />);

    await user.click(screen.getByText(/add command/i));

    expect(screen.getByPlaceholderText(/filename/i)).toBeInTheDocument();
  });

  it('saves new command when form submitted', async () => {
    const user = userEvent.setup();
    vi.mocked(configApi.add).mockResolvedValue({
      success: true,
      data: { filename: 'my-command.md', content: '# My Command\n\nDoes something', enabled: true },
    });

    render(<CommandsTab />);

    // Open form
    await user.click(screen.getByText(/add command/i));

    // Fill in command details
    await user.type(screen.getByPlaceholderText(/filename/i), 'my-command');

    // Submit
    await user.click(screen.getByText(/^save$/i));

    // Verify command was saved via configApi
    await waitFor(() => {
      expect(configApi.add).toHaveBeenCalledWith(
        'commands',
        expect.objectContaining({
          filename: expect.stringContaining('my-command'),
        }),
      );
    });
  });

  it('deletes command when delete button clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(configApi.list).mockResolvedValue({
      success: true,
      data: [
        { filename: 'test.md', content: '# Test\n\nTest command', enabled: true },
      ],
    });
    vi.mocked(configApi.remove).mockResolvedValue({
      success: true,
      data: { deleted: true },
    });

    render(<CommandsTab />);

    await waitFor(() => {
      expect(screen.getByText('/test')).toBeInTheDocument();
    });

    // Click delete (trash icon) — first click shows confirmation
    const deleteButton = screen.getByTitle('Delete');
    await user.click(deleteButton);

    // Confirm deletion
    const confirmButton = screen.getByText('Delete');
    await user.click(confirmButton);

    expect(configApi.remove).toHaveBeenCalledWith('commands', 'test.md');
  });
});
