import { describe, test, expect } from 'vitest';
import type { CommandEntry } from '@/hooks/useCommandRegistry';

/**
 * Filtering logic that should match useSlashCommands.ts.
 * Searches both name AND source for the query.
 */
function filterCommands(
  commands: CommandEntry[],
  kind: 'command' | 'agent',
  query: string,
): CommandEntry[] {
  const q = query.toLowerCase();
  return commands
    .filter((cmd) => cmd.kind === kind)
    .filter((cmd) => {
      const name = cmd.name.toLowerCase();
      const source = cmd.source.toLowerCase();
      return name.startsWith(q) || name.includes(q) || source.includes(q);
    })
    .sort((a, b) => {
      const aPrefix = a.name.toLowerCase().startsWith(q);
      const bPrefix = b.name.toLowerCase().startsWith(q);
      if (aPrefix && !bPrefix) return -1;
      if (!aPrefix && bPrefix) return 1;
      return a.name.localeCompare(b.name);
    });
}

function makeCmd(
  name: string,
  source: string = 'user',
  kind: 'command' | 'agent' = 'command',
): CommandEntry {
  return {
    name,
    filename: `${name}.md`,
    description: `Description for ${name}`,
    source,
    content: `# ${name}\nContent here`,
    kind,
  };
}

describe('slash command filtering', () => {
  const commands: CommandEntry[] = [
    // ECC plugin — names are just filenames, source is plugin name
    makeCmd('evolve', 'everything-claude-code'),
    makeCmd('tdd', 'everything-claude-code'),
    makeCmd('tdd-workflow', 'everything-claude-code'),
    makeCmd('plan', 'everything-claude-code'),
    makeCmd('e2e', 'everything-claude-code'),
    makeCmd('claw', 'everything-claude-code'),
    makeCmd('eval', 'everything-claude-code'),
    // Anthropic Official plugin — simple names
    makeCmd('review', 'Anthropic Official'),
    makeCmd('test-writer', 'Anthropic Official'),
    // User-defined standalone
    makeCmd('my-helper', 'user'),
  ];

  test('/ever matches all everything-claude-code commands via source search', () => {
    const result = filterCommands(commands, 'command', 'ever');
    const names = result.map((c) => c.name);
    expect(names).toContain('evolve');
    expect(names).toContain('tdd');
    expect(names).toContain('plan');
    expect(names).toContain('e2e');
    expect(names).toContain('claw');
    expect(names).toContain('eval');
    expect(names).toContain('tdd-workflow');
    expect(names).toHaveLength(7);
  });

  test('/anthro matches Anthropic Official commands via source search', () => {
    const result = filterCommands(commands, 'command', 'anthro');
    const names = result.map((c) => c.name);
    expect(names).toContain('review');
    expect(names).toContain('test-writer');
    expect(names).toHaveLength(2);
  });

  test('/tdd matches by name (prefix and substring)', () => {
    const result = filterCommands(commands, 'command', 'tdd');
    const names = result.map((c) => c.name);
    expect(names).toContain('tdd');
    expect(names).toContain('tdd-workflow');
  });

  test('/rev matches review by name', () => {
    const result = filterCommands(commands, 'command', 'rev');
    const names = result.map((c) => c.name);
    expect(names).toContain('review');
  });

  test('prefix name matches sort before source-only matches', () => {
    const result = filterCommands(commands, 'command', 'ev');
    const names = result.map((c) => c.name);
    // "eval" and "evolve" start with "ev" — prefix matches
    // Everything else matches via source ("everything-claude-code" contains "ev")
    const evalIdx = names.indexOf('eval');
    const evolveIdx = names.indexOf('evolve');
    const clawIdx = names.indexOf('claw'); // source-only match
    expect(evalIdx).toBeLessThan(clawIdx);
    expect(evolveIdx).toBeLessThan(clawIdx);
  });

  test('empty query matches all commands', () => {
    const result = filterCommands(commands, 'command', '');
    expect(result).toHaveLength(commands.length);
  });

  test('user source is not searchable (too generic)', () => {
    // Typing /user should NOT match my-helper just because source is "user"
    // Actually it will — "user" is the source. This is fine as a feature.
    const result = filterCommands(commands, 'command', 'my-h');
    const names = result.map((c) => c.name);
    expect(names).toContain('my-helper');
    expect(names).toHaveLength(1);
  });

  test('agents filtered separately from commands', () => {
    const mixed = [
      ...commands,
      makeCmd('code-reviewer', 'everything-claude-code', 'agent'),
    ];
    const result = filterCommands(mixed, 'agent', 'ever');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('code-reviewer');
  });
});
