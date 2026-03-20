import { memo, useCallback, useEffect, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { nanoid } from 'nanoid';
import { CheckIcon, XIcon, RefreshCcwIcon, CopyIcon, FileIcon } from 'lucide-react';

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from './ai-elements/tool';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from './ai-elements/reasoning';
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from './ai-elements/plan';
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from './ai-elements/confirmation';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from './ai-elements/chain-of-thought';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from './ai-elements/code-block';
import {
  Commit,
  CommitActions,
  CommitAuthor,
  CommitAuthorAvatar,
  CommitContent,
  CommitCopyButton,
  CommitFile,
  CommitFileAdditions,
  CommitFileChanges,
  CommitFileDeletions,
  CommitFileIcon,
  CommitFileInfo,
  CommitFilePath,
  CommitFileStatus,
  CommitFiles,
  CommitHash,
  CommitHeader,
  CommitInfo,
  CommitMessage,
  CommitMetadata,
  CommitSeparator,
  CommitTimestamp,
} from './ai-elements/commit';
import {
  Test,
  TestError,
  TestErrorMessage,
  TestErrorStack,
  TestResults,
  TestResultsContent,
  TestResultsDuration,
  TestResultsHeader,
  TestResultsProgress,
  TestResultsSummary,
  TestSuite,
  TestSuiteContent,
  TestSuiteName,
} from './ai-elements/test-results';
import {
  Terminal,
  TerminalActions,
  TerminalClearButton,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from './ai-elements/terminal';
import {
  Task,
  TaskContent,
  TaskItem,
  TaskItemFile,
  TaskTrigger,
} from './ai-elements/task';
import { Shimmer } from './ai-elements/shimmer';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from './ai-elements/sources';
import { Suggestion, Suggestions } from './ai-elements/suggestion';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from './ai-elements/message';
import {
  Checkpoint,
  CheckpointIcon,
  CheckpointTrigger,
} from './ai-elements/checkpoint';
import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemDescription,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from './ai-elements/queue';
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from './ai-elements/attachments';
import {
  Agent,
  AgentContent,
  AgentHeader,
  AgentInstructions,
  AgentOutput,
  AgentTool,
  AgentTools,
} from './ai-elements/agent';
import {
  Sandbox,
  SandboxContent,
  SandboxHeader,
  SandboxTabContent,
  SandboxTabs,
  SandboxTabsBar,
  SandboxTabsList,
  SandboxTabsTrigger,
} from './ai-elements/sandbox';
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselItem,
  InlineCitationCarouselNext,
  InlineCitationCarouselPrev,
  InlineCitationSource,
  InlineCitationText,
} from './ai-elements/inline-citation';
import { Image as AiImage } from './ai-elements/image';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

const Section = memo(({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-4">
    <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    <div>{children}</div>
    <hr className="border-border" />
  </section>
));
Section.displayName = 'Section';

// ---------------------------------------------------------------------------
// Tool section
// ---------------------------------------------------------------------------

const bashInput = { command: 'npm run build', cwd: '/workspace' };
const readInput = { path: 'src/index.ts' };
const writeInput = { path: 'dist/bundle.js', content: '...' };

const ToolSection = memo(() => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">State: input-streaming (Bash)</p>
    <Tool defaultOpen>
      <ToolHeader state="input-streaming" title="Bash" type="tool-Bash" />
      <ToolContent>
        <ToolInput input={bashInput} />
      </ToolContent>
    </Tool>

    <p className="text-sm text-muted-foreground">State: output-available (Read)</p>
    <Tool>
      <ToolHeader state="output-available" title="Read" type="tool-Read" />
      <ToolContent>
        <ToolInput input={readInput} />
        <ToolOutput errorText={undefined} output="export function main() {\n  console.log('hello');\n}" />
      </ToolContent>
    </Tool>

    <p className="text-sm text-muted-foreground">State: output-error (Write)</p>
    <Tool>
      <ToolHeader state="output-error" title="Write" type="tool-Write" />
      <ToolContent>
        <ToolInput input={writeInput} />
        <ToolOutput errorText="Permission denied: /dist/bundle.js" output={undefined} />
      </ToolContent>
    </Tool>
  </div>
));
ToolSection.displayName = 'ToolSection';

// ---------------------------------------------------------------------------
// Reasoning section
// ---------------------------------------------------------------------------

const REASONING_TEXT =
  'Let me think through this carefully.\n\nFirst, I need to understand the authentication flow. The OAuth token is stored per-user in KV under the claudeToken field.\n\nNext, I should check if the token needs refreshing before making the API call. The refresh logic lives in the Worker, not the container.\n\nFinally, I can construct the request with the correct authorization header.';

const ReasoningSection = memo(() => (
  <Reasoning className="w-full" isStreaming={false}>
    <ReasoningTrigger />
    <ReasoningContent>{REASONING_TEXT}</ReasoningContent>
  </Reasoning>
));
ReasoningSection.displayName = 'ReasoningSection';

// ---------------------------------------------------------------------------
// Plan section
// ---------------------------------------------------------------------------

const PlanSection = memo(() => (
  <Plan defaultOpen={true}>
    <PlanHeader>
      <div>
        <div className="mb-4 flex items-center gap-2">
          <FileIcon className="size-4" />
          <PlanTitle>Refactor Authentication</PlanTitle>
        </div>
        <PlanDescription>
          Migrate from session-based auth to OAuth token flow, updating all API
          routes and the container startup sequence to inject tokens correctly.
        </PlanDescription>
      </div>
      <PlanTrigger />
    </PlanHeader>
    <PlanContent>
      <div className="space-y-4 text-sm">
        <div>
          <h3 className="mb-2 font-semibold">Steps</h3>
          <ul className="list-inside list-disc space-y-1">
            <li>Audit existing session handling in Worker routes</li>
            <li>Implement OAuth token storage in AUTH_KV</li>
            <li>Update container startup to receive token via env</li>
            <li>Remove legacy session JWT generation</li>
          </ul>
        </div>
      </div>
    </PlanContent>
    <PlanFooter className="justify-end">
      <PlanAction>
        <button className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground">
          Build
        </button>
      </PlanAction>
    </PlanFooter>
  </Plan>
));
PlanSection.displayName = 'PlanSection';

// ---------------------------------------------------------------------------
// Confirmation section
// ---------------------------------------------------------------------------

const ConfirmationSection = memo(() => {
  const noop = useCallback(() => undefined, []);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">State: approval-requested</p>
      <Confirmation approval={{ id: nanoid() }} state="approval-requested">
        <ConfirmationTitle>
          <ConfirmationRequest>
            This tool wants to delete{' '}
            <code className="inline rounded bg-muted px-1.5 py-0.5 text-sm">
              /tmp/build-cache
            </code>
            . Do you approve?
          </ConfirmationRequest>
          <ConfirmationAccepted>
            <CheckIcon className="size-4 text-green-600 dark:text-green-400" />
            <span>Accepted</span>
          </ConfirmationAccepted>
          <ConfirmationRejected>
            <XIcon className="size-4 text-destructive" />
            <span>Rejected</span>
          </ConfirmationRejected>
        </ConfirmationTitle>
        <ConfirmationActions>
          <ConfirmationAction onClick={noop} variant="outline">Reject</ConfirmationAction>
          <ConfirmationAction onClick={noop} variant="default">Approve</ConfirmationAction>
        </ConfirmationActions>
      </Confirmation>

      <p className="text-sm text-muted-foreground">State: accepted</p>
      <Confirmation approval={{ approved: true, id: nanoid() }} state="approval-responded">
        <ConfirmationTitle>
          <ConfirmationRequest>
            This tool wants to delete <code className="inline rounded bg-muted px-1.5 py-0.5 text-sm">/tmp/build-cache</code>.
          </ConfirmationRequest>
          <ConfirmationAccepted>
            <CheckIcon className="size-4 text-green-600 dark:text-green-400" />
            <span>You approved this action</span>
          </ConfirmationAccepted>
          <ConfirmationRejected>
            <XIcon className="size-4 text-destructive" />
            <span>Rejected</span>
          </ConfirmationRejected>
        </ConfirmationTitle>
      </Confirmation>

      <p className="text-sm text-muted-foreground">State: rejected</p>
      <Confirmation approval={{ approved: false, id: nanoid() }} state="output-denied">
        <ConfirmationTitle>
          <ConfirmationRequest>
            This tool wants to delete <code className="inline rounded bg-muted px-1.5 py-0.5 text-sm">/tmp/build-cache</code>.
          </ConfirmationRequest>
          <ConfirmationAccepted>
            <CheckIcon className="size-4 text-green-600 dark:text-green-400" />
            <span>Accepted</span>
          </ConfirmationAccepted>
          <ConfirmationRejected>
            <XIcon className="size-4 text-destructive" />
            <span>You rejected this action</span>
          </ConfirmationRejected>
        </ConfirmationTitle>
      </Confirmation>
    </div>
  );
});
ConfirmationSection.displayName = 'ConfirmationSection';

// ---------------------------------------------------------------------------
// Chain of Thought section
// ---------------------------------------------------------------------------

const ChainOfThoughtSection = memo(() => (
  <ChainOfThought defaultOpen={true}>
    <ChainOfThoughtHeader>Planning the refactor</ChainOfThoughtHeader>
    <ChainOfThoughtContent>
      <ChainOfThoughtStep status="complete" label="Read existing auth module" />
      <ChainOfThoughtStep status="complete" label="Identify token storage patterns" description="Found claudeToken field in user KV record" />
      <ChainOfThoughtStep
        status="active"
        label={<Shimmer>Analyzing container startup sequence...</Shimmer>}
      />
      <ChainOfThoughtStep status="pending" label="Write migration plan" />
    </ChainOfThoughtContent>
  </ChainOfThought>
));
ChainOfThoughtSection.displayName = 'ChainOfThoughtSection';

// ---------------------------------------------------------------------------
// Code Block section
// ---------------------------------------------------------------------------

const TS_CODE = `import { createClient } from './lib/anthropic';

export async function streamChat(userId: string, prompt: string) {
  const client = await createClient(userId);
  const stream = await client.messages.stream({
    model: 'claude-opus-4-5',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });
  return stream;
}`;

const CodeBlockSection = memo(() => (
  <CodeBlock code={TS_CODE} language="typescript">
    <CodeBlockHeader>
      <CodeBlockTitle>
        <FileIcon size={14} />
        <CodeBlockFilename>stream-chat.ts</CodeBlockFilename>
      </CodeBlockTitle>
      <CodeBlockActions>
        <CodeBlockCopyButton onCopy={() => undefined} onError={() => undefined} />
      </CodeBlockActions>
    </CodeBlockHeader>
  </CodeBlock>
));
CodeBlockSection.displayName = 'CodeBlockSection';

// ---------------------------------------------------------------------------
// Commit section
// ---------------------------------------------------------------------------

const COMMIT_HASH = 'b10ae47f3c9a1e2d4f56789a0b1c2d3e4f5a6b7c';
const COMMIT_TIMESTAMP = new Date(Date.now() - 1000 * 60 * 60 * 3);

const COMMIT_FILES = [
  { path: 'src/auth/oauth.ts', status: 'added' as const, additions: 142, deletions: 0 },
  { path: 'src/routes/chat.ts', status: 'modified' as const, additions: 38, deletions: 12 },
  { path: 'src/legacy/session.ts', status: 'deleted' as const, additions: 0, deletions: 87 },
];

const CommitSection = memo(() => (
  <Commit>
    <CommitHeader>
      <CommitAuthor>
        <CommitAuthorAvatar initials="JB" />
      </CommitAuthor>
      <CommitInfo>
        <CommitMessage>feat: migrate to OAuth token auth flow</CommitMessage>
        <CommitMetadata>
          <CommitHash>{COMMIT_HASH.slice(0, 7)}</CommitHash>
          <CommitSeparator />
          <CommitTimestamp date={COMMIT_TIMESTAMP} />
        </CommitMetadata>
      </CommitInfo>
      <CommitActions>
        <CommitCopyButton hash={COMMIT_HASH} onCopy={() => undefined} />
      </CommitActions>
    </CommitHeader>
    <CommitContent>
      <CommitFiles>
        {COMMIT_FILES.map((file) => (
          <CommitFile key={file.path}>
            <CommitFileInfo>
              <CommitFileStatus status={file.status} />
              <CommitFileIcon />
              <CommitFilePath>{file.path}</CommitFilePath>
            </CommitFileInfo>
            <CommitFileChanges>
              <CommitFileAdditions count={file.additions} />
              <CommitFileDeletions count={file.deletions} />
            </CommitFileChanges>
          </CommitFile>
        ))}
      </CommitFiles>
    </CommitContent>
  </Commit>
));
CommitSection.displayName = 'CommitSection';

// ---------------------------------------------------------------------------
// Test Results section
// ---------------------------------------------------------------------------

const TestResultsSection = memo(() => (
  <TestResults summary={{ duration: 1842, failed: 1, passed: 3, skipped: 1, total: 5 }}>
    <TestResultsHeader>
      <TestResultsSummary />
      <TestResultsDuration />
    </TestResultsHeader>
    <div className="border-b px-4 py-3">
      <TestResultsProgress />
    </div>
    <TestResultsContent>
      <TestSuite defaultOpen={true} name="Auth Flow" status="failed">
        <TestSuiteName />
        <TestSuiteContent>
          <Test duration={42} name="should validate OAuth token" status="passed" />
          <Test duration={38} name="should refresh expired token" status="passed" />
          <Test duration={95} name="should reject invalid token" status="passed" />
          <Test duration={310} name="should handle token revocation" status="failed">
            <TestError>
              <TestErrorMessage>Expected 401 but received 500</TestErrorMessage>
              <TestErrorStack>{`  at Object.<anonymous> (src/auth.test.ts:87:14)\n  at Promise.then.completed (node_modules/jest-circus/build/utils.js:391:28)`}</TestErrorStack>
            </TestError>
          </Test>
          <Test name="should support multiple sessions" status="skipped" />
        </TestSuiteContent>
      </TestSuite>
    </TestResultsContent>
  </TestResults>
));
TestResultsSection.displayName = 'TestResultsSection';

// ---------------------------------------------------------------------------
// Terminal section
// ---------------------------------------------------------------------------

const ANSI_OUTPUT = `\u001B[32m+\u001B[0m Installing dependencies...
\u001B[1m\u001B[34minfo\u001B[0m  - Resolving packages
\u001B[32m✓\u001B[0m Installed 142 packages in 3.2s

\u001B[1m\u001B[33mwarn\u001B[0m  - Deprecated: \u001B[1mnode-fetch\u001B[0m — use native fetch

\u001B[36mBuilding worker...\u001B[0m
\u001B[37m  src/index.ts\u001B[0m          \u001B[32m12.4 kB\u001B[0m
\u001B[37m  src/do/session.ts\u001B[0m    \u001B[32m8.1 kB\u001B[0m
\u001B[37m  src/do/chat.ts\u001B[0m       \u001B[32m6.3 kB\u001B[0m

\u001B[32m✓\u001B[0m Build completed in 4.17s
\u001B[90mDeploying to Cloudflare Workers...\u001B[0m
\u001B[32m✓\u001B[0m Deployed: vaporforge.workers.dev
`;

const TerminalSection = memo(() => {
  const [output, setOutput] = useState('');
  const [isStreaming, setIsStreaming] = useState(true);

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index < ANSI_OUTPUT.length) {
        setOutput(ANSI_OUTPUT.slice(0, index + 12));
        index += 12;
      } else {
        setIsStreaming(false);
        clearInterval(interval);
      }
    }, 20);
    return () => clearInterval(interval);
  }, []);

  const handleClear = useCallback(() => {
    setOutput('');
    setIsStreaming(false);
  }, []);

  return (
    <Terminal autoScroll={true} isStreaming={isStreaming} onClear={handleClear} output={output}>
      <TerminalHeader>
        <TerminalTitle>Deploy Output</TerminalTitle>
        <div className="flex items-center gap-1">
          <TerminalStatus />
          <TerminalActions>
            <TerminalCopyButton onCopy={() => undefined} />
            <TerminalClearButton />
          </TerminalActions>
        </div>
      </TerminalHeader>
      <TerminalContent />
    </Terminal>
  );
});
TerminalSection.displayName = 'TerminalSection';

// ---------------------------------------------------------------------------
// Task section
// ---------------------------------------------------------------------------

const TASK_ITEMS = [
  { key: nanoid(), value: 'Reading project structure' },
  { key: nanoid(), value: 'Scanning 34 source files' },
  {
    key: nanoid(),
    value: (
      <span className="inline-flex items-center gap-1">
        Read
        <TaskItemFile>
          <span>src/auth/oauth.ts</span>
        </TaskItemFile>
      </span>
    ),
  },
  {
    key: nanoid(),
    value: (
      <span className="inline-flex items-center gap-1">
        Edit
        <TaskItemFile>
          <span>src/routes/chat.ts</span>
        </TaskItemFile>
      </span>
    ),
  },
  { key: nanoid(), value: 'Running type check' },
];

const TaskSection = memo(() => (
  <Task className="w-full">
    <TaskTrigger title="Working... 3/5 steps" />
    <TaskContent>
      {TASK_ITEMS.map((item) => (
        <TaskItem key={item.key}>{item.value}</TaskItem>
      ))}
    </TaskContent>
  </Task>
));
TaskSection.displayName = 'TaskSection';

// ---------------------------------------------------------------------------
// Shimmer section
// ---------------------------------------------------------------------------

const ShimmerSection = memo(() => (
  <div className="space-y-4">
    <Shimmer duration={2}>Analyzing your codebase...</Shimmer>
    <Shimmer as="h3" className="font-semibold text-base" duration={3}>
      Generating implementation plan
    </Shimmer>
    <div>
      Processing request{' '}
      <Shimmer as="span" className="inline" duration={1}>
        with AI
      </Shimmer>
      ...
    </div>
  </div>
));
ShimmerSection.displayName = 'ShimmerSection';

// ---------------------------------------------------------------------------
// Sources section
// ---------------------------------------------------------------------------

const SOURCES = [
  { href: 'https://developers.cloudflare.com/durable-objects/', title: 'Cloudflare Durable Objects' },
  { href: 'https://sdk.vercel.ai/docs', title: 'Vercel AI SDK Docs' },
  { href: 'https://platform.anthropic.com/docs', title: 'Anthropic API Reference' },
];

const SourcesSection = memo(() => (
  <Sources>
    <SourcesTrigger count={SOURCES.length} />
    <SourcesContent>
      {SOURCES.map((source) => (
        <Source href={source.href} key={source.href} title={source.title} />
      ))}
    </SourcesContent>
  </Sources>
));
SourcesSection.displayName = 'SourcesSection';

// ---------------------------------------------------------------------------
// Suggestion section
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  'Explain Durable Objects',
  'How does KV caching work?',
  'Show me streaming patterns',
  'Debug this Worker error',
];

const SuggestionSection = memo(() => (
  <Suggestions>
    {SUGGESTIONS.map((s) => (
      <Suggestion key={s} onClick={() => undefined} suggestion={s} />
    ))}
  </Suggestions>
));
SuggestionSection.displayName = 'SuggestionSection';

// ---------------------------------------------------------------------------
// Message section
// ---------------------------------------------------------------------------

const USER_MSG_KEY = nanoid();
const ASSISTANT_MSG_KEY = nanoid();
const ASSISTANT_VERSION_ID = nanoid();

const ASSISTANT_CONTENT = `# Durable Objects Overview

Durable Objects provide **strongly-consistent storage** and **coordination** for Cloudflare Workers.

## Key properties

- Each instance has a unique ID and runs on a single machine
- Requests to the same DO are serialized
- Built-in SQLite (via \`this.ctx.storage\`)

## Example

\`\`\`ts
export class MyDO extends DurableObject {
  async fetch(req: Request) {
    const count = (await this.ctx.storage.get('count') ?? 0) as number;
    await this.ctx.storage.put('count', count + 1);
    return new Response(String(count + 1));
  }
}
\`\`\`

Would you like to see a streaming example?`;

const MessageSection = memo(() => {
  const [liked, setLiked] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Message from="user" key={USER_MSG_KEY}>
        <MessageContent>
          Can you explain how Durable Objects work in Cloudflare Workers?
        </MessageContent>
      </Message>

      <Message from="assistant" key={ASSISTANT_MSG_KEY}>
        <MessageBranch defaultBranch={0}>
          <MessageBranchContent>
            <MessageContent key={ASSISTANT_VERSION_ID}>
              <MessageResponse>{ASSISTANT_CONTENT}</MessageResponse>
            </MessageContent>
          </MessageBranchContent>
          <MessageToolbar>
            <MessageBranchSelector>
              <MessageBranchPrevious />
              <MessageBranchPage />
              <MessageBranchNext />
            </MessageBranchSelector>
            <MessageActions>
              <MessageAction label="Retry" onClick={() => undefined} tooltip="Regenerate">
                <RefreshCcwIcon className="size-4" />
              </MessageAction>
              <MessageAction
                label="Like"
                onClick={() => setLiked((v) => !v)}
                tooltip="Like this response"
              >
                <svg
                  className="size-4"
                  fill={liked ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                  <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                </svg>
              </MessageAction>
              <MessageAction label="Copy" onClick={() => undefined} tooltip="Copy">
                <CopyIcon className="size-4" />
              </MessageAction>
            </MessageActions>
          </MessageToolbar>
        </MessageBranch>
      </Message>
    </div>
  );
});
MessageSection.displayName = 'MessageSection';

// ---------------------------------------------------------------------------
// Checkpoint section
// ---------------------------------------------------------------------------

const CheckpointSection = memo(() => (
  <div className="rounded-lg border p-4">
    <Checkpoint>
      <CheckpointIcon />
      <CheckpointTrigger
        onClick={() => undefined}
        tooltip="Restores workspace and chat to this point"
      >
        Restore checkpoint
      </CheckpointTrigger>
    </Checkpoint>
  </div>
));
CheckpointSection.displayName = 'CheckpointSection';

// ---------------------------------------------------------------------------
// Queue section
// ---------------------------------------------------------------------------

const pendingItems = [
  { id: 'q1', title: 'Refactor auth module', description: 'Split OAuth into its own service' },
  { id: 'q2', title: 'Update dependencies', description: undefined },
  { id: 'q3', title: 'Write integration tests', description: 'Cover all API routes' },
];

const completedItems = [
  { id: 'q4', title: 'Set up CI pipeline', description: 'GitHub Actions with Vitest' },
  { id: 'q5', title: 'Deploy to staging', description: undefined },
];

const QueueShowcaseSection = memo(() => (
  <Queue>
    <QueueSection defaultOpen>
      <QueueSectionTrigger>
        <QueueSectionLabel count={pendingItems.length} label="Pending" />
      </QueueSectionTrigger>
      <QueueSectionContent>
        <QueueList>
          {pendingItems.map((item) => (
            <QueueItem key={item.id}>
              <div className="flex items-center gap-2">
                <QueueItemIndicator completed={false} />
                <QueueItemContent completed={false}>{item.title}</QueueItemContent>
              </div>
              {item.description && (
                <QueueItemDescription completed={false}>{item.description}</QueueItemDescription>
              )}
            </QueueItem>
          ))}
        </QueueList>
      </QueueSectionContent>
    </QueueSection>
    <QueueSection defaultOpen>
      <QueueSectionTrigger>
        <QueueSectionLabel count={completedItems.length} label="Completed" />
      </QueueSectionTrigger>
      <QueueSectionContent>
        <QueueList>
          {completedItems.map((item) => (
            <QueueItem key={item.id}>
              <div className="flex items-center gap-2">
                <QueueItemIndicator completed={true} />
                <QueueItemContent completed={true}>{item.title}</QueueItemContent>
              </div>
            </QueueItem>
          ))}
        </QueueList>
      </QueueSectionContent>
    </QueueSection>
  </Queue>
));
QueueShowcaseSection.displayName = 'QueueShowcaseSection';

// ---------------------------------------------------------------------------
// Attachments section
// ---------------------------------------------------------------------------

const showcaseAttachments = [
  {
    filename: 'screenshot.png',
    id: 'att-1',
    mediaType: 'image/png',
    type: 'file' as const,
    url: 'https://placehold.co/200x200/1a1a2e/ffffff?text=Image+1',
  },
  {
    filename: 'diagram.jpg',
    id: 'att-2',
    mediaType: 'image/jpeg',
    type: 'file' as const,
    url: 'https://placehold.co/200x200/0f3460/ffffff?text=Image+2',
  },
  {
    filename: 'report.pdf',
    id: 'att-3',
    mediaType: 'application/pdf',
    type: 'file' as const,
    url: '',
  },
];

const AttachmentsShowcaseSection = memo(() => (
  <Attachments variant="grid">
    {showcaseAttachments.map((attachment) => (
      <Attachment data={attachment} key={attachment.id} onRemove={() => undefined}>
        <AttachmentPreview />
        <AttachmentRemove />
      </Attachment>
    ))}
  </Attachments>
));
AttachmentsShowcaseSection.displayName = 'AttachmentsShowcaseSection';

// ---------------------------------------------------------------------------
// Agent section
// ---------------------------------------------------------------------------

const readFileTool = {
  description: 'Read the contents of a file at the given path',
  inputSchema: z.object({
    path: z.string().describe('File path to read'),
  }),
};

const writeFileTool = {
  description: 'Write content to a file at the given path',
  inputSchema: z.object({
    content: z.string().describe('Content to write'),
    path: z.string().describe('File path to write'),
  }),
};

const agentOutputSchema = `z.object({
  issues: z.array(z.object({
    line: z.number(),
    message: z.string(),
    severity: z.enum(['error', 'warning', 'info']),
  })),
  summary: z.string(),
})`;

const AgentShowcaseSection = memo(() => (
  <Agent>
    <AgentHeader model="claude-sonnet-4-6" name="Code Review Agent" />
    <AgentContent>
      <AgentInstructions>
        You are an expert code reviewer. Analyze the provided code for bugs,
        security issues, and style violations. Provide actionable feedback with
        line numbers and severity ratings.
      </AgentInstructions>
      <AgentTools type="multiple">
        <AgentTool tool={readFileTool} value="read_file" />
        <AgentTool tool={writeFileTool} value="write_file" />
      </AgentTools>
      <AgentOutput schema={agentOutputSchema} />
    </AgentContent>
  </Agent>
));
AgentShowcaseSection.displayName = 'AgentShowcaseSection';

// ---------------------------------------------------------------------------
// Sandbox section
// ---------------------------------------------------------------------------

const sandboxCode = `def fibonacci(n):
    """Return nth Fibonacci number."""
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

result = fibonacci(10)
print(f"fibonacci(10) = {result}")`;

const sandboxOutput = `fibonacci(10) = 55`;

const SandboxShowcaseSection = memo(() => (
  <Sandbox>
    <SandboxHeader state="output-available" title="main.py" />
    <SandboxContent>
      <SandboxTabs defaultValue="code">
        <SandboxTabsBar>
          <SandboxTabsList>
            <SandboxTabsTrigger value="code">main.py</SandboxTabsTrigger>
            <SandboxTabsTrigger value="output">output</SandboxTabsTrigger>
          </SandboxTabsList>
        </SandboxTabsBar>
        <SandboxTabContent value="code">
          <CodeBlock className="border-0" code={sandboxCode} language="python">
            <CodeBlockHeader>
              <CodeBlockTitle>
                <CodeBlockFilename>main.py</CodeBlockFilename>
              </CodeBlockTitle>
              <CodeBlockActions>
                <CodeBlockCopyButton size="sm" />
              </CodeBlockActions>
            </CodeBlockHeader>
          </CodeBlock>
        </SandboxTabContent>
        <SandboxTabContent value="output">
          <CodeBlock className="border-0" code={sandboxOutput} language="log">
            <CodeBlockHeader>
              <CodeBlockActions>
                <CodeBlockCopyButton size="sm" />
              </CodeBlockActions>
            </CodeBlockHeader>
          </CodeBlock>
        </SandboxTabContent>
      </SandboxTabs>
    </SandboxContent>
  </Sandbox>
));
SandboxShowcaseSection.displayName = 'SandboxShowcaseSection';

// ---------------------------------------------------------------------------
// Inline Citation section
// ---------------------------------------------------------------------------

const citationSources = [
  {
    description: 'How transformer architectures enable context-aware language understanding.',
    title: 'Attention Is All You Need',
    url: 'https://arxiv.org/abs/1706.03762',
  },
  {
    description: 'Scaling laws for language model performance as a function of compute.',
    title: 'Scaling Laws for Neural Language Models',
    url: 'https://arxiv.org/abs/2001.08361',
  },
];

const InlineCitationShowcaseSection = memo(() => (
  <p className="text-sm leading-relaxed">
    Large language models have transformed natural language processing over the
    past several years.{' '}
    <InlineCitation>
      <InlineCitationText>
        Recent breakthroughs in model architecture and training scale have led
        to significant gains in reasoning and instruction-following ability
      </InlineCitationText>
      <InlineCitationCard>
        <InlineCitationCardTrigger
          sources={citationSources.map((s) => s.url)}
        />
        <InlineCitationCardBody>
          <InlineCitationCarousel>
            <InlineCitationCarouselHeader>
              <InlineCitationCarouselPrev />
              <InlineCitationCarouselNext />
              <InlineCitationCarouselIndex />
            </InlineCitationCarouselHeader>
            <InlineCitationCarouselContent>
              {citationSources.map((source) => (
                <InlineCitationCarouselItem key={source.url}>
                  <InlineCitationSource
                    description={source.description}
                    title={source.title}
                    url={source.url}
                  />
                </InlineCitationCarouselItem>
              ))}
            </InlineCitationCarouselContent>
          </InlineCitationCarousel>
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
    . These advances continue to open new possibilities for AI-assisted
    development.
  </p>
));
InlineCitationShowcaseSection.displayName = 'InlineCitationShowcaseSection';

// ---------------------------------------------------------------------------
// Image section
// ---------------------------------------------------------------------------

const PLACEHOLDER_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVR42mNk+A9QTwMJAAIBAQAA//8C' +
  'TAAIoAAAAABJRU5ErkJggg==';

const ImageShowcaseSection = memo(() => (
  <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      AI-generated image rendered from base64 data
    </p>
    <AiImage
      alt="AI generated placeholder"
      base64={PLACEHOLDER_BASE64}
      className="h-32 w-32 rounded-md border"
      mediaType="image/png"
      uint8Array={new Uint8Array()}
    />
  </div>
));
ImageShowcaseSection.displayName = 'ImageShowcaseSection';

// ---------------------------------------------------------------------------
// Main Showcase page
// ---------------------------------------------------------------------------

export const Showcase = memo(() => (
  <TooltipProvider>
  <div className="fixed inset-0 overflow-y-auto bg-background text-foreground">
    <div className="max-w-3xl mx-auto p-8 space-y-12">
      <header>
        <h1 className="text-2xl font-bold text-foreground">AI Elements Showcase</h1>
        <p className="mt-2 text-muted-foreground text-sm">
          Visual reference for every AI Elements component with mock data.
        </p>
      </header>

      <Section title="Tool">
        <ToolSection />
      </Section>

      <Section title="Reasoning">
        <ReasoningSection />
      </Section>

      <Section title="Plan">
        <PlanSection />
      </Section>

      <Section title="Confirmation">
        <ConfirmationSection />
      </Section>

      <Section title="Chain of Thought">
        <ChainOfThoughtSection />
      </Section>

      <Section title="Code Block">
        <CodeBlockSection />
      </Section>

      <Section title="Commit">
        <CommitSection />
      </Section>

      <Section title="Test Results">
        <TestResultsSection />
      </Section>

      <Section title="Terminal">
        <TerminalSection />
      </Section>

      <Section title="Task">
        <TaskSection />
      </Section>

      <Section title="Shimmer">
        <ShimmerSection />
      </Section>

      <Section title="Sources">
        <SourcesSection />
      </Section>

      <Section title="Suggestion">
        <SuggestionSection />
      </Section>

      <Section title="Message">
        <MessageSection />
      </Section>

      <Section title="Checkpoint">
        <CheckpointSection />
      </Section>

      <Section title="Queue">
        <QueueShowcaseSection />
      </Section>

      <Section title="Attachments">
        <AttachmentsShowcaseSection />
      </Section>

      <Section title="Agent">
        <AgentShowcaseSection />
      </Section>

      <Section title="Sandbox">
        <SandboxShowcaseSection />
      </Section>

      <Section title="Inline Citation">
        <InlineCitationShowcaseSection />
      </Section>

      <Section title="Image">
        <ImageShowcaseSection />
      </Section>
    </div>
  </div>
  </TooltipProvider>
));

Showcase.displayName = 'Showcase';

export default Showcase;
