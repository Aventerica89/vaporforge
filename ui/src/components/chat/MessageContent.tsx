import { memo, useMemo, useState } from 'react';
import type { Message, MessagePart } from '@/lib/types';
import { ChatMarkdown } from './ChatMarkdown';
import { ToolCallBlock } from './ToolCallBlock';
import { TaskPlanBlock } from './TaskPlanBlock';
import { HandoffChain } from '@/components/elements/HandoffChain';
import { PlanCard } from '@/components/ai-elements/PlanCard';
import { QuestionFlow } from '@/components/ai-elements/QuestionFlow';
import { parseTaskPlan } from '@/lib/parsers/task-plan-parser';
import { useSmoothText } from '@/hooks/useSmoothText';
import { useSandboxStore } from '@/hooks/useSandbox';
import { Reasoning, ReasoningTrigger, ReasoningContent } from '@/components/prompt-kit/reasoning';
import { Tool } from '@/components/prompt-kit/tool';
import { CodeBlock, CodeBlockCode, CodeBlockGroup } from '@/components/prompt-kit/code-block';
import { Steps, StepsContent, StepsItem, StepsTrigger } from '@/components/prompt-kit/steps';
import { TextShimmer } from '@/components/prompt-kit/text-shimmer';
import { Check, Copy } from 'lucide-react';

interface MessageContentProps {
  message: Message;
}

interface StreamingContentProps {
  parts: MessagePart[];
  fallbackContent: string;
}

function SmoothTextPart({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  const smoothed = useSmoothText(content, isStreaming);
  return <ChatMarkdown content={smoothed} isStreaming={isStreaming} />;
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

// Verbatim from ChatPreview — prompt-kit CodeBlock with inline header + copy button
interface CodeBlockWithCopyProps {
  code: string;
  language: string;
  filename?: string;
}

function CodeBlockWithCopy({ code, language, filename }: CodeBlockWithCopyProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <CodeBlock>
      <CodeBlockGroup className="border-b border-zinc-700/60 py-2 pl-4 pr-2">
        <div className="flex items-center gap-2">
          <div className="rounded bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-300">
            {language}
          </div>
          {filename && <span className="text-xs text-zinc-400">{filename}</span>}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex size-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-700/60 hover:text-zinc-200"
        >
          {copied ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
        </button>
      </CodeBlockGroup>
      <CodeBlockCode code={code} language={language} />
    </CodeBlock>
  );
}

function renderPart(
  part: MessagePart,
  index: number,
  isStreaming = false,
  allParts?: MessagePart[],
) {
  switch (part.type) {
    case 'text':
      if (!part.content) return null;
      return isStreaming ? (
        <SmoothTextPart key={index} content={part.content} isStreaming />
      ) : (
        <ChatMarkdown key={index} content={part.content} />
      );

    case 'reasoning':
      return (
        <Reasoning key={index} isStreaming={isStreaming}>
          <ReasoningTrigger className="text-xs text-muted-foreground">
            {part.duration ? `Thought for ${part.duration}s` : 'Thinking...'}
          </ReasoningTrigger>
          <ReasoningContent markdown contentClassName="mt-2 text-xs">
            {part.content || ''}
          </ReasoningContent>
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
          <PlanCard key={index} title={pi.title} steps={pi.steps ?? []} estimatedSteps={pi.estimatedSteps} />
        );
      }
      if (part.name === 'ask_user_questions') {
        return <AskQuestionsBlock key={index} part={part} />;
      }
      // Hide tool-start in completed messages — tool-result renders the full state
      if (!isStreaming) return null;
      return (
        <Tool
          key={index}
          toolPart={{
            type: part.name || 'Tool',
            state: 'input-streaming',
            input: part.input,
            toolCallId: part.toolId,
          }}
        />
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
      return (
        <Tool
          key={index}
          toolPart={{
            type: part.name || 'Tool',
            state: 'output-available',
            input: matchingStart?.input ?? part.input,
            output: part.output != null ? { result: part.output } : undefined,
            toolCallId: part.toolId,
          }}
        />
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
        <Steps key={index} defaultOpen={isActive}>
          <StepsTrigger>
            {isActive ? (
              <TextShimmer
                className="text-sm"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, #a1a1aa 0%, #71717a 40%, #a1a1aa 100%)',
                }}
              >
                {triggerLabel}
              </TextShimmer>
            ) : (
              triggerLabel
            )}
          </StepsTrigger>
          <StepsContent>
            {part.steps.map((step) => (
              <StepsItem key={step.title}>{step.title}</StepsItem>
            ))}
          </StepsContent>
        </Steps>
      );
    }

    case 'error':
      return (
        <div
          key={index}
          className="my-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error"
        >
          {part.content || 'An error occurred'}
        </div>
      );

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
    return (
      <>
        {taskPlan && <TaskPlanBlock plan={taskPlan} />}
        <HandoffChain parts={message.parts} />
        {message.parts.map((part, i) => renderPart(part, i, false, message.parts))}
      </>
    );
  }

  return (
    <>
      <ChatMarkdown content={message.content} />
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border/30 pt-2">
          {message.toolCalls.map((tool) => (
            <ToolCallBlock
              key={tool.id}
              part={{
                type: 'tool-result',
                name: tool.name,
                input: tool.input,
                output: tool.output,
              }}
            />
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
      <>
        {streamingPlan && <TaskPlanBlock plan={streamingPlan} isStreaming />}
        {parts.map((part, i) => {
          const isLast = i === parts.length - 1;
          const isStreamingPart =
            isLast &&
            (part.type === 'text' ||
              part.type === 'tool-start' ||
              part.type === 'reasoning' ||
              part.type === 'chain-of-thought');
          return renderPart(part, i, isStreamingPart, parts);
        })}
      </>
    );
  }

  if (fallbackContent) {
    return <ChatMarkdown content={fallbackContent} isStreaming />;
  }

  return null;
}
