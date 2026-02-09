import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandsTab } from '../CommandsTab';
import { useSandboxStore } from '@/hooks/useSandbox';
import { sessionsApi } from '@/lib/api';

// Mock dependencies
vi.mock('@/hooks/useSandbox');
vi.mock('@/lib/api');

describe('CommandsTab', () => {
  const mockSessionId = 'test-session-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when no session exists', () => {
    beforeEach(() => {
      vi.mocked(useSandboxStore).mockReturnValue(
        (selector: any) => selector({ currentSession: null })
      );
    });

    it('shows "Start a session" message', () => {
      render(<CommandsTab />);
      expect(screen.getByText(/start a session to manage commands/i)).toBeInTheDocument();
    });

    it('does not show add button', () => {
      render(<CommandsTab />);
      expect(screen.queryByText(/add command/i)).not.toBeInTheDocument();
    });
  });

  describe('when session exists', () => {
    beforeEach(() => {
      vi.mocked(useSandboxStore).mockReturnValue(
        (selector: any) => selector({ currentSession: { id: mockSessionId } })
      );
      vi.mocked(sessionsApi.exec).mockResolvedValue({
        success: true,
        data: { stdout: '', stderr: '' }
      });
    });

    it('shows add command button', async () => {
      render(<CommandsTab />);
      await waitFor(() => {
        expect(screen.getByText(/add command/i)).toBeInTheDocument();
      });
    });

    it('loads existing commands on mount', async () => {
      vi.mocked(sessionsApi.exec).mockResolvedValueOnce({
        success: true,
        data: { stdout: 'review.md\ntest.md\n', stderr: '' }
      });
      vi.mocked(sessionsApi.exec).mockResolvedValueOnce({
        success: true,
        data: { stdout: '# Review\n\nReview code', stderr: '' }
      });
      vi.mocked(sessionsApi.exec).mockResolvedValueOnce({
        success: true,
        data: { stdout: '# Test\n\nGenerate tests', stderr: '' }
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

      await waitFor(() => {
        expect(screen.getByText(/add command/i)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/add command/i));

      expect(screen.getByPlaceholderText(/command-name/i)).toBeInTheDocument();
    });

    it('saves new command when form submitted', async () => {
      const user = userEvent.setup();
      vi.mocked(sessionsApi.exec).mockResolvedValue({
        success: true,
        data: { stdout: '', stderr: '' }
      });

      render(<CommandsTab />);

      await waitFor(() => {
        expect(screen.getByText(/add command/i)).toBeInTheDocument();
      });

      // Open form
      await user.click(screen.getByText(/add command/i));

      // Fill in command details
      await user.type(screen.getByPlaceholderText(/command-name/i), 'my-command');
      await user.type(screen.getByRole('textbox', { name: '' }), '# My Command\n\nDoes something');

      // Submit
      await user.click(screen.getByText(/^save$/i));

      // Verify command was saved
      await waitFor(() => {
        expect(sessionsApi.exec).toHaveBeenCalledWith(
          mockSessionId,
          expect.stringContaining('mkdir -p ~/.claude/commands')
        );
      });
    });
  });

  describe('command management', () => {
    beforeEach(() => {
      vi.mocked(useSandboxStore).mockReturnValue(
        (selector: any) => selector({ currentSession: { id: mockSessionId } })
      );
      vi.mocked(sessionsApi.exec).mockResolvedValue({
        success: true,
        data: { stdout: 'test.md\n', stderr: '' }
      });
    });

    it('deletes command when delete button clicked', async () => {
      const user = userEvent.setup();
      vi.mocked(sessionsApi.exec).mockResolvedValueOnce({
        success: true,
        data: { stdout: 'test.md\n', stderr: '' }
      });
      vi.mocked(sessionsApi.exec).mockResolvedValueOnce({
        success: true,
        data: { stdout: '# Test\n\nTest command', stderr: '' }
      });

      render(<CommandsTab />);

      await waitFor(() => {
        expect(screen.getByText('/test')).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '' });
      await user.click(deleteButton);

      expect(sessionsApi.exec).toHaveBeenCalledWith(
        mockSessionId,
        expect.stringContaining('rm ~/.claude/commands/test.md')
      );
    });
  });
});
