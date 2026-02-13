// Static shadcn/ui component catalog for the Dev Playground
// Reference-only — these are copy-paste snippets, not runtime dependencies

export interface ComponentEntry {
  id: string;
  name: string;
  category: 'Form' | 'Layout' | 'Data Display' | 'Feedback' | 'Navigation' | 'Overlay';
  description: string;
  code: string;
  dependencies: string[];
  tailwindClasses: string[];
}

export const componentCatalog: ComponentEntry[] = [
  // ─── Form ───
  {
    id: 'button',
    name: 'Button',
    category: 'Form',
    description: 'Clickable button with variants: default, outline, ghost, destructive.',
    code: `function Button({ children, variant = 'default', size = 'md', ...props }) {
  const base = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  };
  const sizes = {
    sm: 'h-9 px-3 text-xs',
    md: 'h-10 px-4 py-2 text-sm',
    lg: 'h-11 px-8 text-base',
  };
  return (
    <button className={\`\${base} \${variants[variant]} \${sizes[size]}\`} {...props}>
      {children}
    </button>
  );
}`,
    dependencies: [],
    tailwindClasses: ['bg-primary', 'text-primary-foreground', 'rounded-md'],
  },
  {
    id: 'input',
    name: 'Input',
    category: 'Form',
    description: 'Text input field with focus ring and placeholder styling.',
    code: `function Input({ className = '', ...props }) {
  return (
    <input
      className={\`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring \${className}\`}
      {...props}
    />
  );
}`,
    dependencies: [],
    tailwindClasses: ['border-input', 'bg-background', 'rounded-md'],
  },
  {
    id: 'textarea',
    name: 'Textarea',
    category: 'Form',
    description: 'Multi-line text area with consistent styling.',
    code: `function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={\`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring \${className}\`}
      {...props}
    />
  );
}`,
    dependencies: [],
    tailwindClasses: ['border-input', 'bg-background', 'min-h-[80px]'],
  },
  {
    id: 'select',
    name: 'Select',
    category: 'Form',
    description: 'Native select dropdown with custom styling.',
    code: `function Select({ children, className = '', ...props }) {
  return (
    <select
      className={\`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring \${className}\`}
      {...props}
    >
      {children}
    </select>
  );
}`,
    dependencies: [],
    tailwindClasses: ['border-input', 'bg-background', 'h-10'],
  },
  {
    id: 'checkbox',
    name: 'Checkbox',
    category: 'Form',
    description: 'Checkbox with label layout.',
    code: `function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}`,
    dependencies: [],
    tailwindClasses: ['h-4', 'w-4', 'rounded', 'border-input'],
  },
  {
    id: 'toggle',
    name: 'Toggle',
    category: 'Form',
    description: 'iOS-style toggle switch.',
    code: `function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={\`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors \${
        checked ? 'bg-primary' : 'bg-muted'
      }\`}
    >
      <span
        className={\`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform \${
          checked ? 'translate-x-5' : 'translate-x-0'
        }\`}
      />
    </button>
  );
}`,
    dependencies: [],
    tailwindClasses: ['rounded-full', 'bg-primary', 'bg-muted'],
  },

  // ─── Layout ───
  {
    id: 'card',
    name: 'Card',
    category: 'Layout',
    description: 'Container card with header, content, and optional footer.',
    code: `function Card({ title, description, children, footer }) {
  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
      {(title || description) && (
        <div className="flex flex-col space-y-1.5 p-6">
          {title && <h3 className="text-2xl font-semibold leading-none tracking-tight">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className="p-6 pt-0">{children}</div>
      {footer && <div className="flex items-center p-6 pt-0">{footer}</div>}
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['rounded-lg', 'border', 'bg-card', 'shadow-sm'],
  },
  {
    id: 'separator',
    name: 'Separator',
    category: 'Layout',
    description: 'Horizontal or vertical divider line.',
    code: `function Separator({ orientation = 'horizontal', className = '' }) {
  return (
    <div
      role="separator"
      className={\`shrink-0 bg-border \${
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px'
      } \${className}\`}
    />
  );
}`,
    dependencies: [],
    tailwindClasses: ['bg-border', 'h-px', 'w-full'],
  },
  {
    id: 'aspect-ratio',
    name: 'Aspect Ratio',
    category: 'Layout',
    description: 'Container that maintains a fixed aspect ratio.',
    code: `function AspectRatio({ ratio = 16 / 9, children }) {
  return (
    <div className="relative w-full" style={{ paddingBottom: \`\${100 / ratio}%\` }}>
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['relative', 'absolute', 'inset-0'],
  },

  // ─── Data Display ───
  {
    id: 'badge',
    name: 'Badge',
    category: 'Data Display',
    description: 'Small label/tag with color variants.',
    code: `function Badge({ children, variant = 'default' }) {
  const variants = {
    default: 'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    destructive: 'bg-destructive text-destructive-foreground',
    outline: 'border border-input text-foreground',
  };
  return (
    <span className={\`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors \${variants[variant]}\`}>
      {children}
    </span>
  );
}`,
    dependencies: [],
    tailwindClasses: ['rounded-full', 'px-2.5', 'py-0.5', 'text-xs'],
  },
  {
    id: 'avatar',
    name: 'Avatar',
    category: 'Data Display',
    description: 'Circular avatar with image fallback to initials.',
    code: `function Avatar({ src, alt, fallback, size = 'md' }) {
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base' };
  return (
    <div className={\`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted \${sizes[size]}\`}>
      {src ? (
        <img src={src} alt={alt} className="aspect-square h-full w-full object-cover" />
      ) : (
        <span className="font-medium text-muted-foreground">{fallback}</span>
      )}
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['rounded-full', 'bg-muted', 'aspect-square'],
  },
  {
    id: 'table',
    name: 'Table',
    category: 'Data Display',
    description: 'Responsive data table with header, body, and striped rows.',
    code: `function Table({ columns, data }) {
  return (
    <div className="relative w-full overflow-auto">
      <table className="w-full caption-bottom text-sm">
        <thead className="[&_tr]:border-b">
          <tr className="border-b border-border transition-colors">
            {columns.map((col) => (
              <th key={col.key} className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {data.map((row, i) => (
            <tr key={i} className="border-b border-border transition-colors hover:bg-muted/50">
              {columns.map((col) => (
                <td key={col.key} className="p-4 align-middle">{row[col.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['border-b', 'border-border', 'hover:bg-muted/50'],
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    category: 'Data Display',
    description: 'Loading placeholder with shimmer animation.',
    code: `function Skeleton({ className = '' }) {
  return (
    <div className={\`animate-pulse rounded-md bg-muted \${className}\`} />
  );
}

// Usage:
// <Skeleton className="h-4 w-[250px]" />
// <Skeleton className="h-12 w-full rounded-lg" />`,
    dependencies: [],
    tailwindClasses: ['animate-pulse', 'rounded-md', 'bg-muted'],
  },

  // ─── Feedback ───
  {
    id: 'alert',
    name: 'Alert',
    category: 'Feedback',
    description: 'Alert banner with icon, title, and description.',
    code: `function Alert({ title, children, variant = 'default' }) {
  const variants = {
    default: 'bg-background text-foreground border-border',
    destructive: 'border-destructive/50 text-destructive bg-destructive/5',
    success: 'border-green-500/50 text-green-600 bg-green-500/5',
    warning: 'border-yellow-500/50 text-yellow-600 bg-yellow-500/5',
  };
  return (
    <div role="alert" className={\`relative w-full rounded-lg border p-4 \${variants[variant]}\`}>
      {title && <h5 className="mb-1 font-medium leading-none tracking-tight">{title}</h5>}
      <div className="text-sm [&_p]:leading-relaxed">{children}</div>
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['rounded-lg', 'border', 'p-4'],
  },
  {
    id: 'progress',
    name: 'Progress',
    category: 'Feedback',
    description: 'Linear progress bar with percentage.',
    code: `function Progress({ value = 0, max = 100 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="relative h-4 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className="h-full bg-primary transition-all"
        style={{ width: \`\${pct}%\` }}
      />
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['rounded-full', 'bg-secondary', 'bg-primary'],
  },
  {
    id: 'spinner',
    name: 'Spinner',
    category: 'Feedback',
    description: 'Animated loading spinner.',
    code: `function Spinner({ size = 'md' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' };
  return (
    <svg className={\`animate-spin \${sizes[size]} text-primary\`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}`,
    dependencies: [],
    tailwindClasses: ['animate-spin', 'text-primary'],
  },

  // ─── Navigation ───
  {
    id: 'tabs',
    name: 'Tabs',
    category: 'Navigation',
    description: 'Horizontal tab navigation with active indicator.',
    code: `function Tabs({ tabs, activeTab, onTabChange }) {
  return (
    <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={\`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all \${
            activeTab === tab.id
              ? 'bg-background text-foreground shadow-sm'
              : 'hover:text-foreground'
          }\`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['rounded-md', 'bg-muted', 'shadow-sm'],
  },
  {
    id: 'breadcrumb',
    name: 'Breadcrumb',
    category: 'Navigation',
    description: 'Breadcrumb trail for hierarchical navigation.',
    code: `function Breadcrumb({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground/40">/</span>}
          {item.href ? (
            <a href={item.href} className="hover:text-foreground transition-colors">{item.label}</a>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}`,
    dependencies: [],
    tailwindClasses: ['text-sm', 'text-muted-foreground'],
  },

  // ─── Overlay ───
  {
    id: 'dialog',
    name: 'Dialog',
    category: 'Overlay',
    description: 'Modal dialog with backdrop, header, and close button.',
    code: `function Dialog({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-50 w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-sm opacity-70 hover:opacity-100 transition-opacity">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['fixed', 'inset-0', 'z-50', 'backdrop-blur-sm'],
  },
  {
    id: 'tooltip',
    name: 'Tooltip',
    category: 'Overlay',
    description: 'Hover tooltip using CSS-only positioning.',
    code: `function Tooltip({ children, content }) {
  return (
    <div className="group relative inline-block">
      {children}
      <div className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap border border-border">
        {content}
      </div>
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['group', 'relative', 'bg-popover', 'shadow-md'],
  },
  {
    id: 'sheet',
    name: 'Sheet',
    category: 'Overlay',
    description: 'Slide-in side panel (drawer) from any edge.',
    code: `function Sheet({ open, onClose, side = 'right', children }) {
  if (!open) return null;
  const positions = {
    left: 'inset-y-0 left-0',
    right: 'inset-y-0 right-0',
    top: 'inset-x-0 top-0',
    bottom: 'inset-x-0 bottom-0',
  };
  const sizes = {
    left: 'w-3/4 max-w-sm h-full',
    right: 'w-3/4 max-w-sm h-full',
    top: 'h-1/3 w-full',
    bottom: 'h-1/3 w-full',
  };
  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div className={\`fixed \${positions[side]} \${sizes[side]} border-border bg-background p-6 shadow-lg\`}>
        {children}
      </div>
    </div>
  );
}`,
    dependencies: [],
    tailwindClasses: ['fixed', 'z-50', 'bg-background', 'shadow-lg'],
  },
];

export const componentCategories = [
  'Form',
  'Layout',
  'Data Display',
  'Feedback',
  'Navigation',
  'Overlay',
] as const;
