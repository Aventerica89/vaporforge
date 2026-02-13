import { ScrollText } from 'lucide-react';
import { ConfigFileTab } from './ConfigFileTab';

export function RulesTab() {
  return (
    <ConfigFileTab
      category="rules"
      title="Rules"
      description={
        'Behavioral rules that shape how Claude responds in your sessions. '
        + 'Each rule is a markdown file injected into ~/.claude/rules/ at session start. '
        + 'Examples: coding style, security policies, naming conventions.'
      }
      icon={<ScrollText className="h-4 w-4 text-primary" />}
      addLabel="Add Rule"
      emptyLabel="No rules yet. Add your own or install a plugin that includes rules."
      defaultContent={
        '# Rule Name\n\n'
        + '## When to Apply\n\n'
        + 'Describe when this rule should be followed.\n\n'
        + '## Requirements\n\n'
        + '- Requirement 1\n'
        + '- Requirement 2\n'
      }
    />
  );
}
