import { FileCode } from 'lucide-react';
import { ConfigFileTab } from './ConfigFileTab';

export function CommandsTab() {
  return (
    <ConfigFileTab
      category="commands"
      title="Slash Commands"
      description="Custom slash commands. Use /command-name in chat. Injected into every new session."
      icon={<FileCode className="h-4 w-4 text-primary" />}
      addLabel="Add Command"
      emptyLabel="No commands yet"
      defaultContent="# New Command\n\nDescribe what this command does.\n"
      displayPrefix="/"
    />
  );
}
