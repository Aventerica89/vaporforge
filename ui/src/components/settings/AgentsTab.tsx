import { Bot } from 'lucide-react';
import { ConfigFileTab } from './ConfigFileTab';

export function AgentsTab() {
  return (
    <ConfigFileTab
      category="agents"
      title="Agents"
      description={
        'Custom agent definitions for specialized tasks. '
        + 'Each agent is a markdown file injected into ~/.claude/agents/ at session start. '
        + 'Claude can spawn these agents when focused expertise is needed.'
      }
      icon={<Bot className="h-4 w-4 text-primary" />}
      addLabel="Add Agent"
      emptyLabel="No agents yet. Add your own or install a plugin that includes agents."
      defaultContent={
        '# Agent Name\n\n'
        + 'You are a specialized agent for [purpose].\n\n'
        + '## Capabilities\n\n'
        + '- Capability 1\n'
        + '- Capability 2\n\n'
        + '## Instructions\n\n'
        + 'Describe how the agent should behave.\n'
      }
    />
  );
}
