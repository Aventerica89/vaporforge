interface GeminiIconProps {
  className?: string;
}

export function GeminiIcon({ className }: GeminiIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Gemini"
    >
      <path
        d="M12 2C9.5 8 8 9.5 2 12c6 2.5 7.5 4 10 10 2.5-6 4-7.5 10-10C16 9.5 14.5 8 12 2z"
        fill="url(#gemini-gradient)"
      />
      <defs>
        <linearGradient
          id="gemini-gradient"
          x1="2"
          y1="2"
          x2="22"
          y2="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#34A853" />
        </linearGradient>
      </defs>
    </svg>
  );
}
