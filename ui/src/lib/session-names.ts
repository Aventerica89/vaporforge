// Memorable session name generator
// Produces names like "phoenix-42", "tango-7", "cobalt-18"

const WORDS = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo',
  'foxtrot', 'gamma', 'helix', 'indigo', 'jade',
  'kilo', 'lunar', 'mesa', 'nova', 'omega',
  'phoenix', 'quartz', 'raven', 'sierra', 'tango',
  'umbra', 'vortex', 'whisper', 'xenon', 'yukon',
  'zenith', 'cobalt', 'ember', 'frost', 'glyph',
  'harbor', 'ivory', 'jasper', 'krypton', 'lapis',
  'mantis', 'nebula', 'onyx', 'prism', 'ridge',
  'sable', 'talon', 'vapor', 'wren', 'zephyr',
  'atlas', 'bolt', 'cipher', 'drift', 'flare',
  'grove', 'haze', 'ion', 'jetson', 'keystone',
];

export function generateSessionName(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  return `${word}-${num}`;
}

// Extract a friendly name from a git repo URL
// "https://github.com/foo/my-project.git" → "my-project"
// "https://github.com/foo/my-project" → "my-project"
// "git@github.com:foo/my-project.git" → "my-project"
export function extractRepoName(url: string): string {
  const cleaned = url.replace(/\.git$/, '').replace(/\/$/, '');
  const parts = cleaned.split(/[/:]/).filter(Boolean);
  return parts[parts.length - 1] || generateSessionName();
}

// Deduplicate: if "my-project" exists, return "my-project-2", then "my-project-3", etc.
export function deduplicateSessionName(base: string, existingNames: string[]): string {
  if (!existingNames.includes(base)) return base;
  let n = 2;
  while (existingNames.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
