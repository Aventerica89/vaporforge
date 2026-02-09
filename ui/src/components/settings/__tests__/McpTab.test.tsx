import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { McpTab } from '../McpTab';
import { useSandboxStore } from '@/hooks/useSandbox';
import { sessionsApi } from '@/lib/api';

// Mock dependencies
vi.mock('@/hooks/useSandbox');
vi.mock('@/lib/api');

describe('McpTab', () => {
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
      render(<McpTab />);
      expect(screen.getByText(/start a session to manage mcp servers/i)).toBeInTheDocument();
    });

    it('does not show add server button', () => {
      render(<McpTab />);
      expect(screen.queryByText(/add server/i)).not.toBeInTheDocument();
    });
  });

  describe('when session exists', () => {
    beforeEach(() => {
      vi.mocked(useSandboxStore).mockReturnValue(
        (selector: any) => selector({ currentSession: { id: mockSessionId } })
      );
      vi.mocked(sessionsApi.exec).mockResolvedValue({
        success: true,
        data: { stdout: '{}', stderr: '' }
      });
    });

    it('shows add server button', async () => {
      render(<McpTab />);
      await waitFor(() => {
        expect(screen.getByText(/add server/i)).toBeInTheDocument();
      });
    });

    it('loads existing servers on mount', async () => {
      const mockConfig = {
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js']
          },
          'http-server': {
            url: 'http://localhost:3000',
            type: 'http'
          }
        }
      };

      vi.mocked(sessionsApi.exec).mockResolvedValue({
        success: true,
        data: { stdout: JSON.stringify(mockConfig), stderr: '' }
      });

      render(<McpTab />);

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument();
        expect(screen.getByText('http-server')).toBeInTheDocument();
      });
    });

    it('opens add server form when button clicked', async () => {
      const user = userEvent.setup();
      render(<McpTab />);

      await waitFor(() => {
        expect(screen.getByText(/add server/i)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/add server/i));

      expect(screen.getByPlaceholderText(/server name/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/http url/i)).toBeInTheDocument();
    });

    it('adds HTTP server when form submitted', async () => {
      const user = userEvent.setup();
      vi.mocked(sessionsApi.exec).mockResolvedValue({
        success: true,
        data: { stdout: '', stderr: '' }
      });

      render(<McpTab />);

      await waitFor(() => {
        expect(screen.getByText(/add server/i)).toBeInTheDocument();
      });

      // Open form
      await user.click(screen.getByText(/add server/i));

      // Fill in server details
      await user.type(screen.getByPlaceholderText(/server name/i), 'my-server');
      await user.type(screen.getByPlaceholderText(/http url/i), 'http://localhost:3000');

      // Submit
      const addButton = screen.getAllByText(/add server/i)[1]; // Get the second one (in the form)
      await user.click(addButton);

      // Verify server was added
      await waitFor(() => {
        expect(sessionsApi.exec).toHaveBeenCalledWith(
          mockSessionId,
          expect.stringContaining('claude mcp add --transport http "my-server" "http://localhost:3000"')
        );
      });
    });

    it('adds stdio server when form submitted', async () => {
      const user = userEvent.setup();
      vi.mocked(sessionsApi.exec).mockResolvedValue({
        success: true,
        data: { stdout: '', stderr: '' }
      });

      render(<McpTab />);

      await waitFor(() => {
        expect(screen.getByText(/add server/i)).toBeInTheDocument();
      });

      // Open form
      await user.click(screen.getByText(/add server/i));

      // Fill in server details
      await user.type(screen.getByPlaceholderText(/server name/i), 'stdio-server');
      await user.type(screen.getByPlaceholderText(/command/i), 'node server.js');

      // Submit
      const addButton = screen.getAllByText(/add server/i)[1];
      await user.click(addButton);

      // Verify server was added
      await waitFor(() => {
        expect(sessionsApi.exec).toHaveBeenCalledWith(
          mockSessionId,
          expect.stringContaining('claude mcp add "stdio-server" -- node "server.js"')
        );
      });
    });

    it('shows error when server addition fails', async () => {
      const user = userEvent.setup();
      vi.mocked(sessionsApi.exec).mockResolvedValueOnce({
        success: true,
        data: { stdout: '{}', stderr: '' }
      });
      vi.mocked(sessionsApi.exec).mockResolvedValueOnce({
        success: false,
        data: { stdout: '', stderr: 'Server already exists' }
      });

      render(<McpTab />);

      await waitFor(() => {
        expect(screen.getByText(/add server/i)).toBeInTheDocument();
      });

      // Open form and submit
      await user.click(screen.getByText(/add server/i));
      await user.type(screen.getByPlaceholderText(/server name/i), 'duplicate');
      await user.type(screen.getByPlaceholderText(/http url/i), 'http://localhost:3000');

      const addButton = screen.getAllByText(/add server/i)[1];
      await user.click(addButton);

      // Verify error is displayed
      await waitFor(() => {
        expect(screen.getByText(/server already exists/i)).toBeInTheDocument();
      });
    });

    it('removes server when delete button clicked', async () => {
      const user = userEvent.setup();
      const mockConfig = {
        mcpServers: {
          'test-server': { command: 'node', args: ['server.js'] }
        }
      };

      vi.mocked(sessionsApi.exec).mockResolvedValue({
        success: true,
        data: { stdout: JSON.stringify(mockConfig), stderr: '' }
      });

      render(<McpTab />);

      await waitFor(() => {
        expect(screen.getByText('test-server')).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: '' });
      await user.click(deleteButton);

      expect(sessionsApi.exec).toHaveBeenCalledWith(
        mockSessionId,
        expect.stringContaining('claude mcp remove "test-server"')
      );
    });
  });
});
