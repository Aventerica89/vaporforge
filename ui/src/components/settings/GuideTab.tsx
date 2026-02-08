import { Terminal } from 'lucide-react';

export function GuideTab() {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          <Terminal className="h-4 w-4 text-primary" />
          Getting Started
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          VaporForge gives you a full Claude Code environment in the cloud.
          Type natural language in the chat to build, edit, and run code.
        </p>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary shrink-0">1.</span>
            <span>Create a new session or clone a repo</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">2.</span>
            <span>Ask Claude to build, fix, or explain code</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">3.</span>
            <span>Use the terminal for shell commands</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">4.</span>
            <span>Browse and edit files in the editor</span>
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wider text-foreground">
          Tips
        </h3>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-primary shrink-0">-</span>
            <span>Sessions persist across browser reloads</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">-</span>
            <span>Claude can read and edit any file in /workspace</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">-</span>
            <span>Use "Clone Repo" to import existing projects</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">-</span>
            <span>After an error, just resend — sessions auto-resume</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">-</span>
            <span>Drag and drop files to upload, or paste images in chat</span>
          </li>
          <li className="flex gap-2">
            <span className="text-primary shrink-0">-</span>
            <span>Pinch to zoom the editor and terminal on touch devices</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
