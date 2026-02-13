/* ── Test Results Parser ────────────────────── */

export interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration?: number;
}

export interface TestSummary {
  framework: 'jest' | 'vitest' | 'pytest' | 'mocha';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration?: number;
  results: TestResult[];
}

/* ── Jest / Vitest ─────────────────────────── */

const JEST_SUMMARY_RE =
  /Tests:\s+(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+skipped,?\s*)?(?:(\d+)\s+passed,?\s*)?(\d+)\s+total/;

const JEST_SUITE_PASS = /^\s*(PASS|FAIL)\s+(.+)$/;
const JEST_TIME_RE = /Time:\s+([\d.]+)\s*s/;

function parseJestVitest(lines: string[]): TestSummary | null {
  const joined = lines.join('\n');
  const summaryMatch = JEST_SUMMARY_RE.exec(joined);
  if (!summaryMatch) return null;

  const failed = parseInt(summaryMatch[1] || '0', 10);
  const skipped = parseInt(summaryMatch[2] || '0', 10);
  const passed = parseInt(summaryMatch[3] || '0', 10);
  const total = parseInt(summaryMatch[4] || '0', 10);

  const timeMatch = JEST_TIME_RE.exec(joined);
  const duration = timeMatch ? parseFloat(timeMatch[1]) : undefined;

  const results: TestResult[] = [];
  for (const line of lines) {
    const suiteMatch = JEST_SUITE_PASS.exec(line);
    if (suiteMatch) {
      results.push({
        name: suiteMatch[2].trim(),
        status: suiteMatch[1] === 'PASS' ? 'pass' : 'fail',
      });
    }
  }

  const framework = joined.includes('vitest') || joined.includes('VITEST')
    ? 'vitest'
    : 'jest';

  return { framework, total, passed, failed, skipped, duration, results };
}

/* ── Pytest ─────────────────────────────────── */

const PYTEST_SUMMARY_RE =
  /=+\s+(?:(\d+)\s+passed)?[,\s]*(?:(\d+)\s+failed)?[,\s]*(?:(\d+)\s+skipped)?[,\s]*(?:(\d+)\s+error)?.*in\s+([\d.]+)s/;

const PYTEST_RESULT_LINE =
  /^(PASSED|FAILED|SKIPPED|ERROR)\s+(.+?)(?:\s+-\s+.*)?$/;

function parsePytest(lines: string[]): TestSummary | null {
  const joined = lines.join('\n');
  const summaryMatch = PYTEST_SUMMARY_RE.exec(joined);
  if (!summaryMatch) return null;

  const passed = parseInt(summaryMatch[1] || '0', 10);
  const failed = parseInt(summaryMatch[2] || '0', 10);
  const skipped = parseInt(summaryMatch[3] || '0', 10);
  const total = passed + failed + skipped;
  const duration = parseFloat(summaryMatch[5] || '0');

  const results: TestResult[] = [];
  for (const line of lines) {
    const m = PYTEST_RESULT_LINE.exec(line);
    if (m) {
      const statusMap: Record<string, TestResult['status']> = {
        PASSED: 'pass',
        FAILED: 'fail',
        SKIPPED: 'skip',
        ERROR: 'fail',
      };
      results.push({
        name: m[2].trim(),
        status: statusMap[m[1]] || 'fail',
      });
    }
  }

  return {
    framework: 'pytest',
    total,
    passed,
    failed,
    skipped,
    duration,
    results,
  };
}

/* ── Mocha ──────────────────────────────────── */

const MOCHA_PASSING_RE = /(\d+)\s+passing\s+\((.+?)\)/;
const MOCHA_FAILING_RE = /(\d+)\s+failing/;
const MOCHA_PENDING_RE = /(\d+)\s+pending/;

function parseMocha(lines: string[]): TestSummary | null {
  const joined = lines.join('\n');
  const passingMatch = MOCHA_PASSING_RE.exec(joined);
  if (!passingMatch) return null;

  const passed = parseInt(passingMatch[1], 10);
  const durationStr = passingMatch[2];
  let duration: number | undefined;
  if (durationStr.includes('ms')) {
    duration = parseFloat(durationStr) / 1000;
  } else if (durationStr.includes('s')) {
    duration = parseFloat(durationStr);
  }

  const failMatch = MOCHA_FAILING_RE.exec(joined);
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;

  const pendMatch = MOCHA_PENDING_RE.exec(joined);
  const skipped = pendMatch ? parseInt(pendMatch[1], 10) : 0;

  const total = passed + failed + skipped;

  return {
    framework: 'mocha',
    total,
    passed,
    failed,
    skipped,
    duration,
    results: [],
  };
}

/* ── Public API ─────────────────────────────── */

/**
 * Parse terminal output and extract test results if detected.
 * Returns null if no recognized test output is found.
 */
export function parseTestOutput(text: string): TestSummary | null {
  const lines = text.split('\n');
  return parseJestVitest(lines) || parsePytest(lines) || parseMocha(lines);
}
