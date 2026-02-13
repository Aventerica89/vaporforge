/* ── Stack Trace Parser ─────────────────────── */

export interface StackFrame {
  functionName: string | null;
  filePath: string;
  line: number;
  column?: number;
  isNodeModule: boolean;
  raw: string;
}

export interface ParsedStackTrace {
  errorType: string;
  errorMessage: string;
  frames: StackFrame[];
}

/* ── Node.js / V8 ──────────────────────────── */

const NODE_ERROR_LINE = /^(\w*Error):\s*(.+)$/;
const NODE_FRAME_RE =
  /^\s+at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/;
const NODE_FRAME_NATIVE =
  /^\s+at\s+(.+?)\s+\((?:node:)?internal\/.+\)$/;

function parseNodeStack(lines: string[]): ParsedStackTrace | null {
  let errorType = 'Error';
  let errorMessage = '';
  const frames: StackFrame[] = [];
  let foundError = false;

  for (const line of lines) {
    if (!foundError) {
      const errMatch = NODE_ERROR_LINE.exec(line);
      if (errMatch) {
        errorType = errMatch[1];
        errorMessage = errMatch[2];
        foundError = true;
        continue;
      }
    }

    const frameMatch = NODE_FRAME_RE.exec(line);
    if (frameMatch) {
      foundError = true;
      const filePath = frameMatch[2];
      frames.push({
        functionName: frameMatch[1] || null,
        filePath,
        line: parseInt(frameMatch[3], 10),
        column: parseInt(frameMatch[4], 10),
        isNodeModule: filePath.includes('node_modules'),
        raw: line.trim(),
      });
      continue;
    }

    if (NODE_FRAME_NATIVE.test(line)) {
      foundError = true;
    }
  }

  if (!foundError || frames.length === 0) return null;

  return { errorType, errorMessage, frames };
}

/* ── Python ─────────────────────────────────── */

const PYTHON_ERROR_LINE = /^(\w+(?:Error|Exception|Warning)):\s*(.*)$/;
const PYTHON_FILE_LINE =
  /^\s+File "(.+?)", line (\d+)(?:, in (.+))?$/;

function parsePythonStack(lines: string[]): ParsedStackTrace | null {
  let errorType = 'Error';
  let errorMessage = '';
  const frames: StackFrame[] = [];
  let foundTraceback = false;

  for (const line of lines) {
    if (line.trim() === 'Traceback (most recent call last):') {
      foundTraceback = true;
      continue;
    }

    if (foundTraceback) {
      const fileMatch = PYTHON_FILE_LINE.exec(line);
      if (fileMatch) {
        const filePath = fileMatch[1];
        frames.push({
          functionName: fileMatch[3] || null,
          filePath,
          line: parseInt(fileMatch[2], 10),
          isNodeModule: filePath.includes('site-packages'),
          raw: line.trim(),
        });
        continue;
      }

      const errMatch = PYTHON_ERROR_LINE.exec(line);
      if (errMatch) {
        errorType = errMatch[1];
        errorMessage = errMatch[2];
        break;
      }
    }
  }

  if (!foundTraceback || frames.length === 0) return null;

  return { errorType, errorMessage, frames };
}

/* ── Public API ─────────────────────────────── */

/**
 * Parse terminal output for stack traces.
 * Supports Node.js/V8 and Python tracebacks.
 * Returns null if no stack trace is found.
 */
export function parseStackTrace(text: string): ParsedStackTrace | null {
  const lines = text.split('\n');
  return parseNodeStack(lines) || parsePythonStack(lines);
}
