import { memo, useMemo, useState, useCallback } from 'react';
import { approveToolUse } from '@/lib/api';
import type { Message, MessagePart } from '@/lib/types';
import { cn } from '@/lib/utils';
import { MessageResponse } from '@/components/ai-elements/message';
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { TaskPlanBlock } from './TaskPlanBlock';
import { HandoffChain } from '@/components/elements/HandoffChain';
import { Plan, PlanHeader, PlanTitle, PlanContent, PlanTrigger } from '@/components/ai-elements/plan';
import { QuestionFlow } from '@/components/ai-elements/QuestionFlow';
import { Confirmation, ConfirmationTitle, ConfirmationRequest, ConfirmationAccepted, ConfirmationRejected, ConfirmationActions, ConfirmationAction } from '@/components/ai-elements/confirmation';
import { parseTaskPlan } from '@/lib/parsers/task-plan-parser';
import { useSandboxStore } from '@/hooks/useSandbox';
import { Reasoning, ReasoningTrigger, ReasoningContent } from '@/components/ai-elements/reasoning';
import { CodeBlock, CodeBlockHeader, CodeBlockTitle, CodeBlockFilename, CodeBlockActions, CodeBlockCopyButton } from '@/components/ai-elements/code-block';
import type { BundledLanguage } from 'shiki';
import { ChainOfThought, ChainOfThoughtHeader, ChainOfThoughtContent, ChainOfThoughtStep } from '@/components/ai-elements/chain-of-thought';
import { Shimmer } from '@/components/ai-elements/shimmer';
import {
  Commit, CommitHeader, CommitHash, CommitMessage as CommitMsg, CommitMetadata, CommitInfo, CommitSeparator, CommitAuthor, CommitAuthorAvatar, CommitTimestamp,
  CommitContent, CommitFiles, CommitFile, CommitFileInfo, CommitFileStatus, CommitFileIcon, CommitFilePath, CommitFileChanges, CommitFileAdditions, CommitFileDeletions,
  CommitActions, CommitCopyButton,
} from '@/components/ai-elements/commit';
import { TestResults, TestResultsHeader, TestResultsSummary, TestResultsContent, Test, TestError, TestErrorMessage } from '@/components/ai-elements/test-results';
import { Checkpoint, CheckpointList } from '@/components/chat/checkpoint';
import { Persona } from '@/components/chat/persona';
import { AlertCircle, ChevronRight, RotateCw } from 'lucide-react';

interface MessageContentProps {
  message: Message;
}

interface StreamingContentProps {
  parts: MessagePart[];
  fallbackContent: string;
}

/** Retry button for crash/warmup errors — re-sends the last user message */
function RetryErrorBlock({ content }: { content: string }) {
  const sendMessage = useSandboxStore((s) => s.sendMessage);
  const messageIds = useSandboxStore((s) => s.messageIds);
  const messagesById = useSandboxStore((s) => s.messagesById);
  const isStreaming = useSandboxStore((s) => s.isStreaming);

  const isRetryable = content.includes('crashed') ||
    content.includes('warming up') ||
    content.includes('warm up') ||
    content.includes('try again') ||
    content.includes('Connection issue');

  const handleRetry = () => {
    // Find the last user message and re-send it
    for (let i = messageIds.length - 1; i >= 0; i--) {
      const msg = messagesById[messageIds[i]];
      if (msg?.role === 'user') {
        void sendMessage(msg.content);
        return;
      }
    }
  };

  return (
    <div className="my-2 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
      <span className="flex-1">{content || 'An error occurred'}</span>
      {isRetryable && !isStreaming && (
        <button
          type="button"
          onClick={handleRetry}
          className="ml-2 flex shrink-0 items-center gap-1 rounded-md bg-error/10 px-2 py-1 text-[11px] font-medium text-error transition-colors hover:bg-error/20"
        >
          <RotateCw className="size-3" />
          Retry
        </button>
      )}
    </div>
  );
}

function AskQuestionsBlock({ part }: { part: MessagePart }) {
  const sendMessage = useSandboxStore((s) => s.sendMessage);
  const input = part.input as {
    title?: string;
    questions: Array<{
      id: string;
      question: string;
      type: 'text' | 'select' | 'multiselect' | 'confirm';
      options?: string[];
      placeholder?: string;
      required?: boolean;
    }>;
  };
  if (!input?.questions?.length) return null;
  return (
    <QuestionFlow
      title={input.title}
      questions={input.questions}
      onSubmit={(formatted) => void sendMessage(formatted)}
    />
  );
}

/** Wrapper for Confirmation that calls the V1.5 approval API */
function ConfirmationBlock({ part }: { part: MessagePart }) {
  const sessionId = useSandboxStore((s) => s.currentSession?.id ?? '');
  const conf = part.confirmation;

  const handleApprove = useCallback(() => {
    if (conf?.approvalId) {
      void approveToolUse(sessionId, conf.approvalId, true).catch(console.error);
    }
  }, [sessionId, conf?.approvalId]);

  const handleDeny = useCallback(() => {
    if (conf?.approvalId) {
      void approveToolUse(sessionId, conf.approvalId, false).catch(console.error);
    }
  }, [sessionId, conf?.approvalId]);

  if (!conf) return null;

  const state = conf.responded ? 'approval-responded' as const : 'approval-requested' as const;
  const approval = { id: conf.approvalId, ...(conf.responded ? { approved: true as const } : {}) };

  return (
    <Confirmation state={state} approval={approval}>
      <ConfirmationTitle>
        <ConfirmationRequest>
          Allow <strong>{conf.toolName}</strong>?
        </ConfirmationRequest>
        <ConfirmationAccepted>Approved</ConfirmationAccepted>
        <ConfirmationRejected>Denied</ConfirmationRejected>
      </ConfirmationTitle>
      <ConfirmationActions>
        <ConfirmationAction variant="outline" onClick={handleDeny}>Deny</ConfirmationAction>
        <ConfirmationAction onClick={handleApprove}>Approve</ConfirmationAction>
      </ConfirmationActions>
    </Confirmation>
  );
}

// Verbatim from ChatPreview — prompt-kit CodeBlock with inline header + copy button
interface CodeBlockWithCopyProps {
  code: string;
  language: string;
  filename?: string;
}

function CodeBlockWithCopy({ code, language, filename }: CodeBlockWithCopyProps) {
  return (
    <CodeBlock code={code} language={(language || 'text') as BundledLanguage}>
      <CodeBlockHeader>
        <CodeBlockTitle>
          <CodeBlockFilename>{filename || language}</CodeBlockFilename>
        </CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}

// ---------------------------------------------------------------------------
// Tool Grouping — collapse consecutive tool-result parts into accordion
// ---------------------------------------------------------------------------

type GroupedItem =
  | { kind: 'part'; part: MessagePart; index: number }
  | { kind: 'tool-group'; parts: Array<{ part: MessagePart; index: number }> };

const CUSTOM_TOOLS = new Set(['create_plan', 'ask_user_questions']);

function groupPartsForRender(parts: MessagePart[]): GroupedItem[] {
  const result: GroupedItem[] = [];
  let toolRun: Array<{ part: MessagePart; index: number }> = [];

  const flushToolRun = () => {
    if (toolRun.length >= 2) {
      result.push({ kind: 'tool-group', parts: toolRun });
    } else if (toolRun.length === 1) {
      result.push({ kind: 'part', part: toolRun[0].part, index: toolRun[0].index });
    }
    toolRun = [];
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isGroupable =
      part.type === 'tool-result' && !CUSTOM_TOOLS.has(part.name ?? '');

    if (isGroupable) {
      toolRun.push({ part, index: i });
    } else {
      flushToolRun();
      result.push({ kind: 'part', part, index: i });
    }
  }
  flushToolRun();
  return result;
}

function ToolGroup({ items, allParts, messageId }: { items: Array<{ part: MessagePart; index: number }>; allParts: MessagePart[]; messageId?: string }) {
  const [expanded, setExpanded] = useState(false);
  const names = items.map((t) => t.part.name).filter(Boolean);
  const uniqueNames = [...new Set(names)];
  const summary = uniqueNames.length <= 3
    ? uniqueNames.join(', ')
    : `${uniqueNames.slice(0, 3).join(', ')} +${uniqueNames.length - 3}`;

  return (
    <div className="my-1.5 overflow-hidden rounded-lg border border-border/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-primary/10/30"
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 flex-shrink-0 transition-transform duration-200',
            expanded && 'rotate-90',
          )}
        />
        <span className="font-medium text-foreground">
          {items.length} tool calls
        </span>
        {!expanded && summary && (
          <span className="truncate font-mono text-muted-foreground/60">
            {summary}
          </span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-border/30 px-1 py-1">
          {items.map((item) => renderPart(item.part, item.index, false, allParts, messageId))}
        </div>
      )}
    </div>
  );
}

function renderPart(
  part: MessagePart,
  index: number,
  isStreaming = false,
  allParts?: MessagePart[],
  _messageId?: string,
) {
  switch (part.type) {
    case 'text':
      if (!part.content) return null;
      return (
        <div key={`text-${index}`} className="text-sm leading-relaxed break-words">
          <MessageResponse>{part.content}</MessageResponse>
        </div>
      );

    case 'reasoning':
      return (
        <Reasoning key={index} isStreaming={isStreaming} duration={part.duration}>
          <ReasoningTrigger />
          <ReasoningContent>{part.content || ''}</ReasoningContent>
        </Reasoning>
      );

    case 'tool-start': {
      if (part.name === 'create_plan' && part.input) {
        const pi = part.input as {
          title: string;
          steps: Array<{ id: string; label: string; detail?: string }>;
          estimatedSteps?: number;
        };
        return (
          <Plan key={index} defaultOpen isStreaming={isStreaming}>
            <PlanHeader>
              <PlanTitle>{pi.title}</PlanTitle>
              <PlanTrigger />
            </PlanHeader>
            <PlanContent>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {(pi.steps ?? []).map((step) => (
                  <li key={step.id}>{step.label}</li>
                ))}
              </ol>
            </PlanContent>
          </Plan>
        );
      }
      if (part.name === 'ask_user_questions') {
        return <AskQuestionsBlock key={index} part={part} />;
      }
      // Hide tool-start in completed messages — tool-result renders the full state
      if (!isStreaming) return null;
      return (
        <Tool key={index} defaultOpen>
          <ToolHeader type="dynamic-tool" state="input-streaming" toolName={part.name || 'Tool'} />
          <ToolContent>{part.input && <ToolInput input={part.input} />}</ToolContent>
        </Tool>
      );
    }

    case 'tool-result': {
      if (part.name === 'create_plan' || part.name === 'ask_user_questions') {
        return null;
      }
      // Look up the matching tool-start to include input in the completed view
      const matchingStart = allParts?.find(
        (p) =>
          p.type === 'tool-start' &&
          (part.toolId ? p.toolId === part.toolId : p.name === part.name),
      );
      const toolInput = matchingStart?.input ?? part.input;
      return (
        <Tool key={index} defaultOpen>
          <ToolHeader type="dynamic-tool" state="output-available" toolName={part.name || 'Tool'} />
          <ToolContent>
            {toolInput && <ToolInput input={toolInput} />}
            <ToolOutput output={part.output} errorText={undefined} />
          </ToolContent>
        </Tool>
      );
    }

    case 'artifact':
      return (
        <CodeBlockWithCopy
          key={index}
          code={part.content || ''}
          language={part.language || 'text'}
          filename={part.filename}
        />
      );

    case 'chain-of-thought': {
      if (!part.steps?.length) return null;
      const isActive = part.steps.some((s) => s.status === 'active');
      const activeStep = part.steps.find((s) => s.status === 'active');
      const triggerLabel = isActive
        ? (activeStep?.title ?? 'Working...')
        : `Completed ${part.steps.length} step${part.steps.length === 1 ? '' : 's'}`;
      return (
        <ChainOfThought key={index} defaultOpen={isActive}>
          <ChainOfThoughtHeader>
            {isActive ? (
              <Shimmer
                className="text-sm [--color-muted-foreground:#a1a1aa] [--color-background:#71717a]"
              >
                {triggerLabel}
              </Shimmer>
            ) : (
              triggerLabel
            )}
          </ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            {part.steps.map((step) => (
              <ChainOfThoughtStep key={step.title} label={step.title} status={step.status} />
            ))}
          </ChainOfThoughtContent>
        </ChainOfThought>
      );
    }

    case 'commit': {
      const c = part.commit;
      if (!c) return null;
      return (
        <Commit key={index}>
          <CommitHeader>
            {c.author && (
              <CommitAuthor>
                <CommitAuthorAvatar initials={c.author.slice(0, 2).toUpperCase()} />
              </CommitAuthor>
            )}
            <CommitInfo>
              <CommitMsg>{c.message}</CommitMsg>
              <CommitMetadata>
                <CommitHash>{c.hash?.slice(0, 7)}</CommitHash>
                {c.date && (
                  <>
                    <CommitSeparator />
                    <CommitTimestamp date={new Date(c.date)} />
                  </>
                )}
              </CommitMetadata>
            </CommitInfo>
            <CommitActions>
              <CommitCopyButton hash={c.hash ?? ''} />
            </CommitActions>
          </CommitHeader>
          <CommitContent>
            {c.files && c.files.length > 0 && (
              <CommitFiles>
                {c.files.map((f) => (
                  <CommitFile key={f.path}>
                    <CommitFileInfo>
                      <CommitFileStatus status={f.status} />
                      <CommitFileIcon />
                      <CommitFilePath>{f.path}</CommitFilePath>
                    </CommitFileInfo>
                    <CommitFileChanges>
                      {f.additions != null && <CommitFileAdditions count={f.additions} />}
                      {f.deletions != null && <CommitFileDeletions count={f.deletions} />}
                    </CommitFileChanges>
                  </CommitFile>
                ))}
              </CommitFiles>
            )}
          </CommitContent>
        </Commit>
      );
    }

    case 'test-results': {
      const tr = part.testResults;
      if (!tr) return null;
      const statusMap: Record<string, 'passed' | 'failed' | 'skipped' | 'running'> = {
        pass: 'passed', fail: 'failed', skip: 'skipped', running: 'running',
      };
      return (
        <TestResults
          key={index}
          summary={{
            passed: tr.passed ?? 0,
            failed: tr.failed ?? 0,
            skipped: tr.skipped ?? 0,
            total: (tr.passed ?? 0) + (tr.failed ?? 0) + (tr.skipped ?? 0),
          }}
        >
          <TestResultsHeader>
            <TestResultsSummary />
          </TestResultsHeader>
          {tr.cases && tr.cases.length > 0 && (
            <TestResultsContent>
              {tr.cases.map((tc) => (
                <Test
                  key={tc.name}
                  name={tc.name}
                  status={statusMap[tc.status] ?? 'passed'}
                  duration={tc.duration}
                >
                  {tc.error && (
                    <TestError>
                      <TestErrorMessage>{tc.error}</TestErrorMessage>
                    </TestError>
                  )}
                </Test>
              ))}
            </TestResultsContent>
          )}
        </TestResults>
      );
    }

    case 'checkpoint-list': {
      const cps = part.checkpoints;
      if (!cps || cps.length === 0) return null;
      return (
        <CheckpointList key={index}>
          {cps.map((cp, i) => (
            <Checkpoint
              key={cp.title}
              status={cp.status}
              title={cp.title}
              description={cp.description}
              timestamp={cp.timestamp}
              index={i + 1}
            />
          ))}
        </CheckpointList>
      );
    }

    case 'confirmation':
      return <ConfirmationBlock key={index} part={part} />;

    case 'persona': {
      const p = part.persona;
      if (!p) return null;
      return <Persona key={index} state={p.state} name={p.name} />;
    }

    case 'error':
      return <RetryErrorBlock key={index} content={part.content || 'An error occurred'} />;

    default:
      return null;
  }
}

export const MessageContent = memo(function MessageContent({ message }: MessageContentProps) {
  const taskPlan = useMemo(
    () => (message.parts ? parseTaskPlan(message.parts) : null),
    [message.parts],
  );

  if (message.parts && message.parts.length > 0) {
    const grouped = groupPartsForRender(message.parts);
    return (
      <div className="flex flex-col gap-3">
        {taskPlan && <TaskPlanBlock plan={taskPlan} />}
        <HandoffChain parts={message.parts} />
        {grouped.map((item, gi) =>
          item.kind === 'tool-group' ? (
            <ToolGroup key={`tg-${gi}`} items={item.parts} allParts={message.parts!} messageId={message.id} />
          ) : (
            renderPart(item.part, item.index, false, message.parts, message.id)
          ),
        )}
      </div>
    );
  }

  return (
    <>
      <div className="text-sm leading-relaxed break-words">
        <MessageResponse>{message.content}</MessageResponse>
      </div>
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border/30 pt-2">
          {message.toolCalls.map((tool) => (
            <Tool key={tool.id} defaultOpen>
              <ToolHeader type="dynamic-tool" state="output-available" toolName={tool.name} />
              <ToolContent>
                {tool.input && <ToolInput input={tool.input} />}
                <ToolOutput output={tool.output} errorText={undefined} />
              </ToolContent>
            </Tool>
          ))}
        </div>
      )}
    </>
  );
});

export function StreamingContent({ parts, fallbackContent }: StreamingContentProps) {
  const streamingPlan = useMemo(() => parseTaskPlan(parts), [parts]);

  if (parts.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        {streamingPlan && <TaskPlanBlock plan={streamingPlan} isStreaming />}
        {parts.map((part, i) => {
          const isLast = i === parts.length - 1;
          const isStreamingPart =
            part.type === 'text' ||
            (isLast &&
              (part.type === 'tool-start' ||
                part.type === 'reasoning' ||
                part.type === 'chain-of-thought'));
          return renderPart(part, i, isStreamingPart, parts, `streaming`);
        })}
      </div>
    );
  }

  if (fallbackContent) {
    return (
      <div className="text-sm leading-relaxed break-words">
        <MessageResponse>{fallbackContent}</MessageResponse>
      </div>
    );
  }

  return null;
}
