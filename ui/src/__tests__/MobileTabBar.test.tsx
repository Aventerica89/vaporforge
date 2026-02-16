import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MobileTabBar } from '@/components/mobile/MobileTabBar';

// Mock haptics — navigator.vibrate is not available in jsdom
vi.mock('@/lib/haptics', () => ({
  haptics: {
    light: vi.fn(),
    medium: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('MobileTabBar', () => {
  const defaultProps = {
    activeTab: 'chat' as const,
    onTabChange: vi.fn(),
    hasSession: true,
    keyboardOpen: false,
  };

  it('renders all 4 tabs when hasSession is true', () => {
    render(<MobileTabBar {...defaultProps} />);

    expect(screen.getByRole('tab', { name: /chat/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /files/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /terminal/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /more/i })).toBeInTheDocument();
  });

  it('renders only Home and More when hasSession is false', () => {
    render(
      <MobileTabBar
        {...defaultProps}
        hasSession={false}
        activeTab="home"
      />,
    );

    expect(screen.getByRole('tab', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /more/i })).toBeInTheDocument();

    expect(screen.queryByRole('tab', { name: /chat/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /files/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /terminal/i })).not.toBeInTheDocument();
  });

  it('calls onTabChange with correct tab ID when clicked', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();

    render(<MobileTabBar {...defaultProps} onTabChange={onTabChange} />);

    await user.click(screen.getByRole('tab', { name: /files/i }));
    expect(onTabChange).toHaveBeenCalledWith('files');

    await user.click(screen.getByRole('tab', { name: /terminal/i }));
    expect(onTabChange).toHaveBeenCalledWith('terminal');

    await user.click(screen.getByRole('tab', { name: /more/i }));
    expect(onTabChange).toHaveBeenCalledWith('more');
  });

  it('hides with translate-y-full when keyboardOpen is true', () => {
    const { container } = render(
      <MobileTabBar {...defaultProps} keyboardOpen={true} />,
    );

    const tabBar = container.firstElementChild as HTMLElement;
    expect(tabBar.className).toContain('translate-y-full');
  });

  it('does not have translate-y-full when keyboardOpen is false', () => {
    const { container } = render(
      <MobileTabBar {...defaultProps} keyboardOpen={false} />,
    );

    const tabBar = container.firstElementChild as HTMLElement;
    expect(tabBar.className).not.toContain('translate-y-full');
  });

  it('highlights active tab with text-primary class', () => {
    render(<MobileTabBar {...defaultProps} activeTab="chat" />);

    const chatTab = screen.getByRole('tab', { name: /chat/i });
    expect(chatTab.className).toContain('text-primary');

    const filesTab = screen.getByRole('tab', { name: /files/i });
    expect(filesTab.className).not.toContain('text-primary');
  });

  it('has correct aria-selected on active and inactive tabs', () => {
    render(<MobileTabBar {...defaultProps} activeTab="terminal" />);

    expect(screen.getByRole('tab', { name: /terminal/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /chat/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('has tablist role on the container', () => {
    render(<MobileTabBar {...defaultProps} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
