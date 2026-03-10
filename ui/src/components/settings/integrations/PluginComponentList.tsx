import { useIntegrationsStore } from '@/hooks/useIntegrationsStore';
import type { Plugin, PluginItem } from '@/lib/types';

interface PluginComponentListProps {
  plugin: Plugin;
}

interface ComponentSection {
  key: 'agents' | 'commands' | 'rules';
  label: string;
  typeIcon: string;
}

const SECTIONS: ComponentSection[] = [
  { key: 'agents', label: 'SKILLS', typeIcon: 'A' },
  { key: 'commands', label: 'COMMANDS', typeIcon: '\u00bb' },
  { key: 'rules', label: 'RULES', typeIcon: 'R' },
];

export function PluginComponentList({ plugin }: PluginComponentListProps) {
  const { expandedItems, toggleExpanded, togglePluginItem, selectFile } =
    useIntegrationsStore();

  return (
    <div>
      <div className="mb-3 font-['Space_Mono'] text-[9px] font-semibold uppercase tracking-[1.2px] text-[#8b949e]">
        Components
      </div>

      {SECTIONS.map((section) => {
        const items: PluginItem[] = plugin[section.key];
        if (!items || items.length === 0) return null;

        return (
          <div key={section.key} className="mb-3">
            <div className="mb-1.5 font-['Space_Mono'] text-[10px] font-semibold uppercase tracking-[1.2px] text-[#8b949e]">
              {section.label} ({items.length})
            </div>

            <div className="flex flex-col gap-1.5">
              {items.map((item, idx) => {
                const expandKey = `${plugin.id}:${section.key}:${idx}`;
                const isExpanded = expandedItems.has(expandKey);
                const desc = item.content?.split('\n')[0]?.replace(/^#\s*/, '') || '';

                return (
                  <div
                    key={item.name}
                    className="overflow-hidden rounded-[6px] border border-[#30363d] bg-[#0d1117]"
                  >
                    {/* Row header — single line */}
                    <button
                      className="flex w-full items-center gap-2 px-[12px] py-[8px] text-left"
                      onClick={() => toggleExpanded(expandKey)}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#cdd9e5"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                      <span className="shrink-0 font-['Space_Mono'] text-[10px] font-bold text-[#8b949e]">
                        {section.typeIcon}
                      </span>
                      <span className="shrink-0 font-['Space_Mono'] text-xs font-bold text-[#cdd9e5]">
                        {item.name}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-['Space_Mono'] text-[10px] text-[#768390]">
                        {desc}
                      </span>
                      <div
                        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                          item.enabled ? 'bg-[#1DD3E6]' : 'bg-[#768390]/30'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePluginItem(plugin.id, section.key, item.name);
                        }}
                        role="switch"
                        aria-checked={item.enabled}
                      >
                        <span
                          className={`absolute top-[3px] h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-[left] ${
                            item.enabled ? 'left-[15px]' : 'left-[3px]'
                          }`}
                        />
                      </div>
                    </button>

                    {/* Expanded content */}
                    <div
                      className={`overflow-hidden transition-all ${
                        isExpanded ? 'max-h-[200px]' : 'max-h-0'
                      }`}
                    >
                      <div className="px-3 pb-2.5 pl-[34px]">
                        <p className="mb-1.5 font-['Space_Mono'] text-[10px] leading-[1.5] text-[#768390]">
                          {item.content?.split('\n').slice(0, 3).join(' ').replace(/^#\s*\S+\s*/, '').trim() || 'No description available'}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span className="font-['Space_Mono'] text-[10px] text-[#768390]">file:</span>
                          <button
                            className="font-['Space_Mono'] text-[10px] font-bold text-[#00e5ff] transition-opacity hover:opacity-70"
                            onClick={() =>
                              selectFile(plugin.id, `${section.key}/${item.filename}`)
                            }
                          >
                            {item.filename}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {plugin.agents.length === 0 &&
        plugin.commands.length === 0 &&
        plugin.rules.length === 0 && (
          <p className="font-['Space_Mono'] text-[10px] text-[#768390]/60">No components</p>
        )}
    </div>
  );
}
