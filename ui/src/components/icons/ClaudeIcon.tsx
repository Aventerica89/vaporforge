interface ClaudeIconProps {
  className?: string;
}

export function ClaudeIcon({ className }: ClaudeIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Claude"
    >
      <rect width="24" height="24" rx="4" fill="#D97757" />
      <path
        d="M13.8 6.5c-.7-1.2-2.1-1.9-3.5-1.7C8.4 5 7 6.6 7 8.5v.1c-1.4.4-2.4 1.7-2.4 3.2 0 1.8 1.5 3.3 3.3 3.3h.3c.4 1.3 1.7 2.2 3.1 2.2 1.8 0 3.3-1.5 3.3-3.3v-.1c1.1-.4 1.9-1.4 1.9-2.7 0-1.4-1-2.5-2.4-2.8-.1-.3-.2-.6-.3-.9z"
        fill="white"
      />
    </svg>
  );
}
