import type { MessagePart, TaskPlan, TaskStep } from '@/lib/types';

type Phase = 'Exploring' | 'Implementing' | 'Testing' | 'Committing' | 'Running commands';

const PHASE_MAP: Record<string, Phase> = {
  read: 'Exploring',
  glob: 'Exploring',
  grep: 'Exploring',
  search: 'Exploring',
  listfiles: 'Exploring',
  searchcode: 'Exploring',

  write: 'Implementing',
  edit: 'Implementing',
  notebookedit: 'Implementing',

  // Bash requires content inspection
};

function classifyBashTool(input?: Record<string, unknown>): Phase {
  const command = typeof input?.command === 'string' ? input.command.toLowerCase() : '';

  if (/\b(git\s+(add|commit|push|tag|merge|rebase))\b/.test(command)) {
    return 'Committing';
  }
  if (/\b(vitest|jest|pytest|mocha|npm\s+test|pnpm\s+test|bun\s+test)\b/.test(command)) {
    return 'Testing';
  }
  return 'Running commands';
}

function getPhase(part: MessagePart): Phase {
  const name = (part.name || '').toLowerCase();

  // Check Bash separately (needs command inspection)
  if (name === 'bash' || name === 'runcommand') {
    return classifyBashTool(part.input);
  }

  return PHASE_MAP[name] || 'Running commands';
}

function extractFilePaths(part: MessagePart): string[] {
  const paths: string[] = [];
  const input = part.input;
  if (!input) return paths;

  // Common SDK tool input patterns
  const candidates = [
    input.file_path,
    input.path,
    input.pattern,
    input.notebook_path,
  ];

  for (const val of candidates) {
    if (typeof val === 'string' && val.includes('/')) {
      paths.push(val);
    }
  }

  return paths;
}

/**
 * Groups consecutive tool-call parts by phase heuristic.
 * Returns null if fewer than 3 tool parts (not worth summarizing).
 */
export function parseTaskPlan(parts: MessagePart[]): TaskPlan | null {
  const toolParts = parts.filter(
    (p) => p.type === 'tool-start' || p.type === 'tool-result'
  );

  // Only show plan for 3+ tool invocations
  if (toolParts.length < 3) return null;

  // Dedupe: only use tool-start parts for grouping (results are paired)
  const startParts = parts.filter((p) => p.type === 'tool-start');
  if (startParts.length < 3) return null;

  const steps: TaskStep[] = [];
  let currentPhase: Phase | null = null;
  let currentStep: TaskStep | null = null;

  for (const part of startParts) {
    const phase = getPhase(part);

    if (phase !== currentPhase) {
      // Start new step
      if (currentStep) {
        currentStep.status = 'complete';
        steps.push(currentStep);
      }

      currentPhase = phase;
      currentStep = {
        id: `step-${steps.length}`,
        label: phase,
        status: 'active',
        toolNames: [part.name || 'unknown'],
        filePaths: extractFilePaths(part),
        duration: part.startedAt ? Date.now() - part.startedAt : undefined,
      };
    } else if (currentStep) {
      // Continue current step
      const name = part.name || 'unknown';
      if (!currentStep.toolNames.includes(name)) {
        currentStep.toolNames.push(name);
      }
      const filePaths = extractFilePaths(part);
      for (const fp of filePaths) {
        if (!currentStep.filePaths.includes(fp)) {
          currentStep.filePaths.push(fp);
        }
      }
    }
  }

  // Finalize last step
  if (currentStep) {
    // Last step is active if the last part overall is a tool-start (still running)
    const lastPart = parts[parts.length - 1];
    currentStep.status = lastPart?.type === 'tool-start' ? 'active' : 'complete';
    steps.push(currentStep);
  }

  if (steps.length === 0) return null;

  // Compute durations from paired tool-start/result
  const resultParts = parts.filter((p) => p.type === 'tool-result');
  let totalDuration = 0;
  for (const rp of resultParts) {
    if (rp.duration) totalDuration += rp.duration;
  }

  return {
    steps,
    totalDuration: totalDuration || undefined,
  };
}
