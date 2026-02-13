import { z } from 'zod';

/* ── Code Analysis ─────────────────────────── */

export const CodeAnalysisSchema = z.object({
  summary: z.string().describe('Brief overview of the code'),
  complexity: z.object({
    score: z.number().min(1).max(10).describe('Complexity score 1-10'),
    label: z.enum(['low', 'medium', 'high', 'very-high']),
    reasoning: z.string().describe('Why this complexity score'),
  }),
  issues: z.array(
    z.object({
      line: z.number().optional().describe('Line number if applicable'),
      severity: z.enum(['error', 'warning', 'info']),
      message: z.string(),
    })
  ),
  suggestions: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
    })
  ),
});

export type CodeAnalysis = z.infer<typeof CodeAnalysisSchema>;

/* ── Commit Message ────────────────────────── */

export const CommitMessageSchema = z.object({
  type: z.enum([
    'feat',
    'fix',
    'refactor',
    'docs',
    'test',
    'chore',
    'perf',
    'ci',
    'style',
    'build',
  ]),
  scope: z.string().optional().describe('Module or area affected'),
  subject: z.string().describe('Short imperative summary'),
  body: z.string().optional().describe('Longer explanation if needed'),
  breaking: z.boolean().describe('Whether this is a breaking change'),
});

export type CommitMessage = z.infer<typeof CommitMessageSchema>;
