// Known shell commands — anything not matching is treated as natural language for the SDK
export const SHELL_COMMANDS = new Set([
  'ls', 'cd', 'pwd', 'cat', 'echo', 'grep', 'find', 'mkdir', 'rmdir',
  'rm', 'cp', 'mv', 'touch', 'chmod', 'chown', 'ln', 'env', 'export',
  'which', 'whoami', 'hostname', 'date', 'uname', 'df', 'du', 'free',
  'top', 'ps', 'kill', 'curl', 'wget', 'tar', 'zip', 'unzip', 'gzip',
  'ssh', 'scp', 'git', 'npm', 'npx', 'node', 'python', 'python3',
  'pip', 'pip3', 'docker', 'wrangler', 'head', 'tail',
  'sed', 'awk', 'sort', 'uniq', 'wc', 'diff', 'patch', 'file',
  'stat', 'test', 'true', 'false', 'sleep', 'clear', 'man',
  'apt', 'apt-get', 'sudo', 'su', 'id', 'groups', 'printenv',
  'set', 'unset', 'source', 'bash', 'sh', 'zsh', 'tee', 'xargs',
  'tr', 'cut', 'paste', 'vi', 'vim', 'nano', 'less', 'more',
]);

// Claude CLI utility commands that should route through exec-stream (not SDK)
const CLAUDE_UTILITY_PATTERNS = [
  '--help', '-h', '--version', 'config', 'setup-token', 'mcp',
];

export function isShellCommand(input: string): boolean {
  const firstWord = input.split(/\s+/)[0];
  if (SHELL_COMMANDS.has(firstWord)) return true;
  if (firstWord.startsWith('./')) return true;
  // Only treat /foo as a path if it has multiple segments (e.g. /usr/bin/node)
  // Single-segment /foo could be a slash command like /mcp, /help
  if (firstWord.startsWith('/') && firstWord.indexOf('/', 1) !== -1) return true;
  if (firstWord.startsWith('~')) return true;
  if (firstWord.includes('=')) return true; // env var assignment
  return false;
}

// Detect `claude --help`, `claude config`, etc. that should NOT use SDK
export function isClaudeUtility(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed.startsWith('claude ') && trimmed !== 'claude') return false;
  const rest = trimmed.slice(7).trim();
  return CLAUDE_UTILITY_PATTERNS.some(
    (p) => rest.startsWith(p)
  );
}
