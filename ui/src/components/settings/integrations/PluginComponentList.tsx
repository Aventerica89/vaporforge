import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import type { Plugin, PluginItem } from '@/lib/types';

interface PluginComponentListProps {
  plugin: Plugin;
}

interface ComponentSection {
  key: 'agents' | 'commands' | 'rules';
  icon: string;
  label: string;
}

const SECTIONS: ComponentSection[] = [
  { key: 'agents', icon: 'A', label: 'AGENTS' },
  { key: 'commands', icon: '$', label: 'COMMANDS' },
  { key: 'rules', icon: 'R', label: 'RULES' },
];

export function PluginComponentList({ plugin }: PluginComponentListProps) {
  const { expandedItems, toggleExpanded, togglePluginItem, selectFile } =
    useIntegrationsStore();

  return (
    <div>
      <div className="mb-2.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
        Components
      </div>

      {SECTIONS.map((section) => {
        const items: PluginItem[] = plugin[section.key];
        if (!items || items.length === 0) return null;

        return (
          <div key={section.key} className="mb-3.5">
            <div className="flex items-center gap-1.5 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
              {section.label}
              <span className="font-normal text-muted-foreground">
                ({items.length})
              </span>
            </div>

            {items.map((item, idx) => {
              const expandKey = `${plugin.id}:${section.key}:${idx}`;
              const isExpanded = expandedItems.has(expandKey);

              return (
                <div
                  key={item.name}
                  className={`mb-1 overflow-hidden rounded-md border transition-colors ${
                    isExpanded ? 'border-border' : 'border-border/40 hover:border-border'
                  }`}
                >
                  {/* Row header */}
                  <div
                    className={`flex cursor-pointer select-none items-center gap-1.5 px-2.5 py-1.5 transition-colors ${
                      isExpanded ? 'bg-card/80' : 'bg-card/50 hover:bg-card/80'
                    }`}
                    onClick={() => toggleExpanded(expandKey)}
                  >
                    <span
                      className={`text-[9px] text-muted-foreground transition-transform ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    >
                      &#9658;
                    </span>
                    <span className="w-3 text-center text-[9px] text-muted-foreground/60">
                      {section.icon}
                    </span>
                    <span className="max-w-[120px] shrink-0 truncate text-[11px] text-foreground">
                      {item.name}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
                      {item.content?.split('\n')[0]?.replace(/^#\s*/, '') || ''}
                    </span>
                    <button
                      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                        item.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePluginItem(plugin.id, section.key, item.name);
                      }}
                    >
                      <span
                        className={`absolute top-[3px] h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-[left] ${
                          item.enabled ? 'left-[15px]' : 'left-[3px]'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Expanded content */}
                  <div
                    className={`overflow-hidden transition-all ${
                      isExpanded ? 'max-h-[200px]' : 'max-h-0'
                    }`}
                  >
                    <div className="px-2.5 py-2 pl-7">
                      <p className="mb-1.5 text-[10px] leading-relaxed text-muted-foreground">
                        {item.content?.split('\n').slice(0, 3).join(' ').replace(/^#\s*\S+\s*/, '').trim() || 'No description available'}
                      </p>
                      <button
                        className="font-mono text-[10px] text-primary transition-opacity before:mr-1 before:text-[9px] before:text-muted-foreground before:content-['file:'] hover:opacity-70"
                        onClick={() =>
                          selectFile(plugin.id, `${section.key}/${item.filename}`)
                        }
                      >
                        {item.filename}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {plugin.agents.length === 0 &&
        plugin.commands.length === 0 &&
        plugin.rules.length === 0 && (
          <p className="text-[10px] text-muted-foreground/60">No components</p>
        )}
    </div>
  );
}
