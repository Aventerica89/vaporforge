export type HashState =
  | { type: 'home' }
  | { type: 'session'; id: string }
  | { type: 'settings'; tab?: string }
  | { type: 'agency' };

export function parseHash(hash: string): HashState {
  const h = hash.replace(/^#/, '');
  if (!h || h === 'home') return { type: 'home' };
  if (h === 'agency') return { type: 'agency' };
  if (h === 'settings') return { type: 'settings' };
  if (h.startsWith('settings/')) return { type: 'settings', tab: h.slice(9) };
  if (h.startsWith('session/')) return { type: 'session', id: h.slice(8) };
  // Redirect legacy #marketplace to settings/integrations
  if (h === 'marketplace') return { type: 'settings', tab: 'integrations' };
  return { type: 'home' };
}

export function buildHash(state: HashState): string {
  switch (state.type) {
    case 'home': return '';
    case 'session': return `#session/${state.id}`;
    case 'settings': return state.tab ? `#settings/${state.tab}` : '#settings';
    case 'agency': return '#agency';
  }
}
