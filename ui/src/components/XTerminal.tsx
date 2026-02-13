import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useSandboxStore } from '@/hooks/useSandbox';
import { useTheme } from '@/hooks/useTheme';
import { usePinchZoom } from '@/hooks/usePinchZoom';
import { isShellCommand, isClaudeUtility } from '@/lib/terminal-utils';
import { sessionsApi, sdkApi } from '@/lib/api';
import { parseTestOutput } from '@/lib/parsers/test-results-parser';
import { parseStackTrace } from '@/lib/parsers/stack-trace-parser';
import { useTestResults } from '@/components/TestResultsOverlay';
import { useStackTrace } from '@/components/StackTraceOverlay';

// Vaporwave-inspired terminal theme
const TERMINAL_THEME = {
  background: '#1a1a2e',
  foreground: '#e0e0e0',
  cursor: '#00d4ff',
  cursorAccent: '#1a1a2e',
  selectionBackground: '#00d4ff33',
  selectionForeground: '#ffffff',
  black: '#1a1a2e',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#6272a4',
  magenta: '#ff79c6',
  cyan: '#00d4ff',
  white: '#e0e0e0',
  brightBlack: '#6272a4',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff',
};

const TERMINAL_THEME_LIGHT = {
  background: '#f5f5f5',
  foreground: '#1a1a2e',
  cursor: '#0094a8',
  cursorAccent: '#f5f5f5',
  selectionBackground: '#0094a833',
  selectionForeground: '#1a1a2e',
  black: '#1a1a2e',
  red: '#d32f2f',
  green: '#2e7d32',
  yellow: '#f57f17',
  blue: '#1565c0',
  magenta: '#7b1fa2',
  cyan: '#00838f',
  white: '#f5f5f5',
  brightBlack: '#616161',
  brightRed: '#e53935',
  brightGreen: '#43a047',
  brightYellow: '#fdd835',
  brightBlue: '#1e88e5',
  brightMagenta: '#8e24aa',
  brightCyan: '#00acc1',
  brightWhite: '#fafafa',
};

const WELCOME_LINE = 'VaporForge Terminal  |  Shell or natural language';
const PROMPT = '\x1b[38;2;0;212;255m$\x1b[0m ';

interface XTerminalProps {
  compact?: boolean;
}

export function XTerminal({ compact }: XTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const inputBuffer = useRef('');
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const savedInput = useRef('');
  const isRunning = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const { currentSession } = useSandboxStore();
  const { isDark } = useTheme();
  const sessionRef = useRef(currentSession);
  sessionRef.current = currentSession;

  const { fontSize: termFontSize, containerProps: pinchProps } = usePinchZoom({
    min: 9,
    max: 22,
    initial: compact ? 12 : 13,
    storageKey: 'vf-terminal-fontsize',
  });

  const writePrompt = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.write(PROMPT);
  }, []);

  // Execute a command and stream output to the terminal
  const executeCommand = useCallback(async (command: string) => {
    const term = termRef.current;
    const session = sessionRef.current;
    if (!term || !session) return;

    isRunning.current = true;

    const trimmed = command.trim();
    const isShell = isShellCommand(trimmed);
    const isClaude = trimmed.startsWith('claude ') || trimmed === 'claude';
    const isUtility = isClaudeUtility(trimmed);

    try {
      if (trimmed === 'clear') {
        term.clear();
        return;
      }

      if (!isShell && !isClaude) {
        // Natural language -> SDK streaming
        const controller = new AbortController();
        abortRef.current = controller;

        for await (const chunk of sdkApi.stream(
          session.id, trimmed, undefined, controller.signal
        )) {
          if (chunk.type === 'connected' || chunk.type === 'done' ||
              chunk.type === 'heartbeat') continue;

          if (chunk.type === 'text' && chunk.content) {
            term.write(chunk.content.replace(/\n/g, '\r\n'));
          } else if (chunk.type === 'tool-start' && chunk.name) {
            term.write(`\r\n\x1b[36m[tool] ${chunk.name}\x1b[0m\r\n`);
          } else if (chunk.type === 'tool-result' && chunk.name) {
            term.write(`\x1b[90m[done] ${chunk.name}\x1b[0m\r\n`);
          } else if (chunk.type === 'error' && chunk.content) {
            term.write(`\r\n\x1b[31mError: ${chunk.content}\x1b[0m\r\n`);
          }
        }

        abortRef.current = null;
        // Refresh files after SDK operations
        useSandboxStore.getState().loadFiles();
        useSandboxStore.getState().loadGitStatus();
      } else if (isClaude && !isUtility) {
        // Claude with prompt -> exec-stream
        let cmd = trimmed;
        if (cmd.startsWith('claude ') &&
            !cmd.includes(' -p ') && !cmd.includes(' --print ')) {
          cmd = cmd.replace(/^claude /, 'claude -p ');
        }

        for await (const chunk of sessionsApi.execStream(session.id, cmd)) {
          if (chunk.type === 'stdout' && chunk.content) {
            term.write(chunk.content.replace(/\n/g, '\r\n'));
          } else if (chunk.type === 'stderr' && chunk.content) {
            term.write(`\x1b[31m${chunk.content.replace(/\n/g, '\r\n')}\x1b[0m`);
          } else if (chunk.type === 'error' && chunk.content) {
            term.write(`\r\n\x1b[31mError: ${chunk.content}\x1b[0m\r\n`);
          }
        }
      } else {
        // Shell commands + Claude utilities -> exec-stream for real-time output
        let outputBuffer = '';
        let stderrBuffer = '';
        for await (const chunk of sessionsApi.execStream(session.id, trimmed)) {
          if (chunk.type === 'stdout' && chunk.content) {
            outputBuffer += chunk.content;
            term.write(chunk.content.replace(/\n/g, '\r\n'));
          } else if (chunk.type === 'stderr' && chunk.content) {
            stderrBuffer += chunk.content;
            term.write(`\x1b[31m${chunk.content.replace(/\n/g, '\r\n')}\x1b[0m`);
          } else if (chunk.type === 'error' && chunk.content) {
            stderrBuffer += chunk.content;
            term.write(`\r\n\x1b[31mError: ${chunk.content}\x1b[0m\r\n`);
          }
        }

        // Auto-detect test results
        const allOutput = outputBuffer + '\n' + stderrBuffer;
        const testResults = parseTestOutput(allOutput);
        if (testResults) {
          useTestResults.getState().showResults(testResults);
        }

        // Auto-detect stack traces in stderr
        if (stderrBuffer) {
          const stackTrace = parseStackTrace(stderrBuffer);
          if (stackTrace) {
            useStackTrace.getState().showTrace(stackTrace);
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        term.write('\r\n\x1b[33m^C\x1b[0m\r\n');
      } else {
        const msg = error instanceof Error ? error.message : 'Command failed';
        term.write(`\r\n\x1b[31mError: ${msg}\x1b[0m\r\n`);
      }
    } finally {
      isRunning.current = false;
      abortRef.current = null;
      term.write('\r\n');
      writePrompt();
    }
  }, [writePrompt]);

  // Handle keyboard input
  const handleData = useCallback((data: string) => {
    const term = termRef.current;
    if (!term) return;

    // If a command is running, Ctrl+C aborts it
    if (isRunning.current) {
      if (data === '\x03') {
        abortRef.current?.abort();
      }
      return;
    }

    for (const char of data) {
      if (char === '\r') {
        // Enter key
        term.write('\r\n');
        const command = inputBuffer.current.trim();
        if (command) {
          history.current = [...history.current, command];
          historyIndex.current = -1;
          savedInput.current = '';
          executeCommand(command);
        } else {
          writePrompt();
        }
        inputBuffer.current = '';
      } else if (char === '\x7f' || char === '\b') {
        // Backspace
        if (inputBuffer.current.length > 0) {
          inputBuffer.current = inputBuffer.current.slice(0, -1);
          term.write('\b \b');
        }
      } else if (char === '\x03') {
        // Ctrl+C — cancel current input
        inputBuffer.current = '';
        term.write('^C\r\n');
        writePrompt();
      } else if (char === '\x15') {
        // Ctrl+U — clear line
        const len = inputBuffer.current.length;
        inputBuffer.current = '';
        term.write('\b \b'.repeat(len));
      } else if (char === '\x1b') {
        // Escape sequences handled by onKey below
        return;
      } else if (char >= ' ') {
        // Printable character
        inputBuffer.current += char;
        term.write(char);
      }
    }
  }, [executeCommand, writePrompt]);

  // Handle arrow keys for command history
  const handleKey = useCallback(({ domEvent }: { domEvent: KeyboardEvent }) => {
    const term = termRef.current;
    if (!term || isRunning.current) return;

    if (domEvent.key === 'ArrowUp') {
      domEvent.preventDefault();
      if (history.current.length === 0) return;

      if (historyIndex.current === -1) {
        savedInput.current = inputBuffer.current;
        historyIndex.current = history.current.length - 1;
      } else if (historyIndex.current > 0) {
        historyIndex.current -= 1;
      }

      replaceLine(term, history.current[historyIndex.current], inputBuffer);
    } else if (domEvent.key === 'ArrowDown') {
      domEvent.preventDefault();
      if (historyIndex.current === -1) return;

      if (historyIndex.current < history.current.length - 1) {
        historyIndex.current += 1;
        replaceLine(term, history.current[historyIndex.current], inputBuffer);
      } else {
        historyIndex.current = -1;
        replaceLine(term, savedInput.current, inputBuffer);
      }
    }
  }, []);

  // Initialize xterm.js
  useEffect(() => {
    if (!containerRef.current) return;

    // Clear container to prevent React StrictMode double-mount DOM conflicts
    const container = containerRef.current;
    container.replaceChildren();

    const term = new XTerm({
      theme: isDark ? TERMINAL_THEME : TERMINAL_THEME_LIGHT,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: termFontSize,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
      convertEol: false,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(container);
    fitAddon.fit();

    // Welcome message
    term.writeln(`\x1b[38;2;0;212;255m${WELCOME_LINE}\x1b[0m`);
    term.writeln('');
    term.write(PROMPT);

    termRef.current = term;
    fitRef.current = fitAddon;

    // Wire up input handlers
    const dataDisposable = term.onData(handleData);
    const keyDisposable = term.onKey(handleKey);

    // Resize observer for fit
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try { fitAddon.fit(); } catch { /* container not ready */ }
      });
    });
    observer.observe(containerRef.current);

    return () => {
      dataDisposable.dispose();
      keyDisposable.dispose();
      observer.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [compact, isDark, handleData, handleKey, termFontSize]);

  // Re-fit when session changes (panel may have resized)
  useEffect(() => {
    if (fitRef.current) {
      requestAnimationFrame(() => {
        try { fitRef.current?.fit(); } catch { /* */ }
      });
    }
  }, [currentSession]);

  // Re-fit when font size changes via pinch-to-zoom
  useEffect(() => {
    if (fitRef.current) {
      requestAnimationFrame(() => {
        try { fitRef.current?.fit(); } catch { /* */ }
      });
    }
  }, [termFontSize]);

  return (
    <div
      ref={containerRef}
      className={`h-full w-full ${isDark ? 'bg-[#1a1a2e]' : 'bg-[#f5f5f5]'}`}
      style={{ padding: compact ? '4px' : '8px' }}
      {...pinchProps}
    />
  );
}

// Helper: replace the current input line with new text
function replaceLine(
  term: XTerm,
  text: string,
  buffer: React.MutableRefObject<string>
) {
  const oldLen = buffer.current.length;
  if (oldLen > 0) {
    term.write('\b'.repeat(oldLen) + ' '.repeat(oldLen) + '\b'.repeat(oldLen));
  }
  term.write(text);
  buffer.current = text;
}
