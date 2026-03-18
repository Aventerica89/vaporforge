import { useState, useEffect, useCallback } from 'react';

interface CssVarState {
  safariToolbarH: string;
  pwaNavNudge: string;
  safeAreaBottom: string;
  isStandalone: boolean;
  viewportHeight: number;
  innerHeight: number;
}

const PRESETS: Record<string, { safari: string; nudge: string }> = {
  'PWA Fix': { safari: '0', nudge: '-12' },
  'Safari Fix': { safari: '0', nudge: '0' },
  'Safari+TB': { safari: '44', nudge: '0' },
  'Bug (double)': { safari: '0', nudge: '0' },
};

function readVars(): CssVarState {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const vv = window.visualViewport;
  return {
    safariToolbarH: style.getPropertyValue('--safari-toolbar-h').trim() || '0px',
    pwaNavNudge: style.getPropertyValue('--pwa-nav-nudge').trim() || '0px',
    safeAreaBottom: (() => {
      // env() can't be read via getPropertyValue — measure it via a probe element
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;bottom:0;left:0;width:0;height:env(safe-area-inset-bottom,0px);pointer-events:none;';
      document.body.appendChild(probe);
      const h = probe.getBoundingClientRect().height;
      document.body.removeChild(probe);
      const varVal = style.getPropertyValue('--safe-area-bottom').trim();
      return `env=${h}px var=${varVal || 'unset'}`;
    })(),
    isStandalone: root.hasAttribute('data-standalone'),
    viewportHeight: vv ? Math.round(vv.height) : 0,
    innerHeight: window.innerHeight,
  };
}

export function SafeAreaDebug() {
  const [open, setOpen] = useState(false);
  const [vars, setVars] = useState<CssVarState>(readVars);
  const [safariSlider, setSafariSlider] = useState(0);
  const [nudgeSlider, setNudgeSlider] = useState(0);

  // Refresh every 500ms when panel is open
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setVars(readVars()), 500);
    return () => clearInterval(id);
  }, [open]);

  const applySliders = useCallback(
    (safari: number, nudge: number) => {
      const root = document.documentElement;
      root.style.setProperty('--safari-toolbar-h', `${safari}px`);
      root.style.setProperty('--pwa-nav-nudge', `${nudge}px`);
      setSafariSlider(safari);
      setNudgeSlider(nudge);
    },
    [],
  );

  const applyPreset = useCallback(
    (name: string) => {
      const p = PRESETS[name];
      if (!p) return;
      applySliders(parseInt(p.safari, 10), parseInt(p.nudge, 10));
    },
    [applySliders],
  );

  const copyConfig = useCallback(() => {
    const text = JSON.stringify(vars, null, 2);
    navigator.clipboard.writeText(text).catch(() => {});
  }, [vars]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-[120px] right-2 z-50 size-10 rounded-full bg-yellow-500/80 text-black flex items-center justify-center text-lg shadow-lg"
        aria-label="Open safe area debug"
      >
        SA
      </button>
    );
  }

  return (
    <div className="fixed bottom-[120px] right-2 z-50 w-64 rounded-lg bg-black/90 border border-yellow-500/50 p-3 text-xs text-white shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-yellow-400">Safe Area Debug</span>
        <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white">
          X
        </button>
      </div>

      {/* Live readouts */}
      <div className="space-y-1 mb-3 font-mono">
        <div>
          Mode:{' '}
          <span className={vars.isStandalone ? 'text-green-400' : 'text-blue-400'}>
            {vars.isStandalone ? 'PWA Standalone' : 'Safari Browser'}
          </span>
        </div>
        <div>--safari-toolbar-h: {vars.safariToolbarH}</div>
        <div>--pwa-nav-nudge: {vars.pwaNavNudge}</div>
        <div>safe-area-bottom: {vars.safeAreaBottom}</div>
        <div>
          viewport: {vars.viewportHeight}px / inner: {vars.innerHeight}px
        </div>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-1 mb-3">
        {Object.keys(PRESETS).map((name) => (
          <button
            key={name}
            onClick={() => applyPreset(name)}
            className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/40 text-[10px]"
          >
            {name}
          </button>
        ))}
      </div>

      {/* Sliders */}
      <div className="space-y-2 mb-3">
        <label className="block">
          <span className="text-white/60">--safari-toolbar-h: {safariSlider}px</span>
          <input
            type="range"
            min={0}
            max={60}
            value={safariSlider}
            onChange={(e) => applySliders(parseInt(e.target.value, 10), nudgeSlider)}
            className="w-full"
          />
        </label>
        <label className="block">
          <span className="text-white/60">--pwa-nav-nudge: {nudgeSlider}px</span>
          <input
            type="range"
            min={-30}
            max={10}
            value={nudgeSlider}
            onChange={(e) => applySliders(safariSlider, parseInt(e.target.value, 10))}
            className="w-full"
          />
        </label>
      </div>

      {/* Copy */}
      <button
        onClick={copyConfig}
        className="w-full py-1 rounded bg-yellow-500/30 text-yellow-200 hover:bg-yellow-500/50 text-[11px]"
      >
        Copy Config
      </button>
    </div>
  );
}
