interface MessageAvatarProps {
  role: 'user' | 'assistant' | 'system';
  isStreaming?: boolean;
}

/** Avatar removed — messages render without avatar gutter now. */
export function MessageAvatar(_props: MessageAvatarProps) {
  return null;
}
