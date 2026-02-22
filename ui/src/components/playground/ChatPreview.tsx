import { nanoid } from 'nanoid';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageBranch,
  MessageBranchContent,
  MessageContent,
} from '@/components/ai-elements/message';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/prompt-kit/reasoning';
import { Markdown } from '@/components/prompt-kit/markdown';
import {
  Sources,
  SourcesContent,
  SourcesTrigger,
  Source as SourceLink,
} from '@/components/ai-elements/sources';
import {
  CodeBlock,
  CodeBlockCode,
  CodeBlockGroup,
} from '@/components/prompt-kit/code-block';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Image } from '@/components/ai-elements/image';
import { Source, SourceContent, SourceTrigger } from '@/components/prompt-kit/source';
import { PulseLoader } from '@/components/prompt-kit/loader';
import { TextShimmer } from '@/components/prompt-kit/text-shimmer';
import {
  Steps,
  StepsContent,
  StepsItem,
  StepsTrigger,
} from '@/components/prompt-kit/steps';
import { Tool } from '@/components/prompt-kit/tool';
import type { SessionStatus } from '@/components/playground/SessionIsland';

// ---------------------------------------------------------------------------
// Mock messages — static demo data for visual preview
// ---------------------------------------------------------------------------

const MOCK_MESSAGES = [
  {
    key: nanoid(),
    from: 'user' as const,
    versions: [{ id: nanoid(), content: 'Can you explain how to use React hooks effectively?' }],
  },
  {
    key: nanoid(),
    from: 'assistant' as const,
    sources: [
      { href: 'https://react.dev/reference/react', title: 'React Documentation' },
      { href: 'https://react.dev/reference/react-dom', title: 'React DOM Documentation' },
    ],
    versions: [
      {
        id: nanoid(),
        content: 'React hooks are a powerful feature. Here are the key rules:\n\n1. Only call hooks at the top level\n2. Don\'t call hooks inside loops or conditions',
      },
    ],
  },
  {
    key: nanoid(),
    from: 'user' as const,
    versions: [{ id: nanoid(), content: 'Show me a code example using useCallback.' }],
  },
  {
    key: nanoid(),
    from: 'assistant' as const,
    reasoning: {
      content: 'The user wants a useCallback example. I should show a clear before/after demonstrating the memoization benefit with a child component.',
      duration: 4,
    },
    versions: [
      {
        id: nanoid(),
        content: 'Here\'s how `useCallback` prevents unnecessary re-renders:',
        code: `const handleClick = useCallback(() => {
  console.log(count);
}, [count]);`,
        language: 'typescript' as const,
        filename: 'example.ts',
      },
    ],
  },
  {
    key: nanoid(),
    from: 'user' as const,
    versions: [{ id: nanoid(), content: 'Any good TypeScript learning resources?' }],
  },
  {
    key: nanoid(),
    from: 'assistant' as const,
    inlineSources: [
      {
        href: 'https://www.typescriptlang.org/docs/',
        title: 'TypeScript Handbook',
        description: 'Complete reference including handbook, playground, and API docs.',
      },
      {
        href: 'https://react.dev/learn/typescript',
        title: 'React + TypeScript Guide',
        description: 'Official guide for using TypeScript with React components and hooks.',
      },
      {
        href: 'https://github.com/microsoft/TypeScript',
        title: 'TypeScript on GitHub',
        description: 'Source repo with examples, issues, and release notes.',
      },
    ],
    versions: [
      {
        id: nanoid(),
        content: 'Here are the best places to start:',
      },
    ],
  },
  {
    key: nanoid(),
    from: 'user' as const,
    versions: [{ id: nanoid(), content: 'What are the best practices for structuring a Next.js project?' }],
  },
  {
    key: nanoid(),
    from: 'assistant' as const,
    stepsWithSources: {
      trigger: 'Web search: Next.js project structure best practices',
      items: ['Searching across curated sources...', 'Top matches'],
      sources: [
        { href: 'https://nextjs.org/docs', label: 'nextjs.org/docs', title: 'Next.js Docs', description: 'Official documentation covering App Router, file conventions, and project layout.' },
        { href: 'https://github.com/vercel/next.js', label: 'github.com/vercel/next.js', title: 'Next.js on GitHub', description: 'Source repo with examples, RFCs, and community conventions.' },
      ],
      trailing: 'Extracting key sections and summarizing…',
    },
    versions: [{ id: nanoid(), content: 'Here\'s what the community converges on:' }],
  },
  {
    key: nanoid(),
    from: 'user' as const,
    versions: [{ id: nanoid(), content: 'Can you scan all my files and check for any issues?' }],
  },
  {
    key: nanoid(),
    from: 'assistant' as const,
    stepsWithShimmer: {
      triggerText: 'Ensuring all files are included',
      items: ['Planning next actions…', 'Searching repository files…', 'Parsing and extracting key sections…', 'Ready to respond'],
    },
    versions: [{ id: nanoid(), content: 'Scan complete. Found 3 items worth reviewing.' }],
  },
  {
    key: nanoid(),
    from: 'user' as const,
    versions: [{ id: nanoid(), content: 'Can you generate a simple logo for a React app?' }],
  },
  {
    key: nanoid(),
    from: 'assistant' as const,
    versions: [
      {
        id: nanoid(),
        content: 'Here\'s a minimal React logo icon:',
        // Compact SVG: purple rounded square with React atom orbits
        image: {
          base64: 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAiIGhlaWdodD0iMTIwIiB2aWV3Qm94PSIwIDAgMTIwIDEyMCI+PHJlY3Qgd2lkdGg9IjEyMCIgaGVpZ2h0PSIxMjAiIHJ4PSIyNCIgZmlsbD0iIzBmMTcyYSIvPjxlbGxpcHNlIGN4PSI2MCIgY3k9IjYwIiByeD0iNDUiIHJ5PSIxNiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjNjFkYWZiIiBzdHJva2Utd2lkdGg9IjMiLz48ZWxsaXBzZSBjeD0iNjAiIGN5PSI2MCIgcng9IjQ1IiByeT0iMTYiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzYxZGFmYiIgc3Ryb2tlLXdpZHRoPSIzIiB0cmFuc2Zvcm09InJvdGF0ZSg2MCw2MCw2MCkiLz48ZWxsaXBzZSBjeD0iNjAiIGN5PSI2MCIgcng9IjQ1IiByeT0iMTYiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzYxZGFmYiIgc3Ryb2tlLXdpZHRoPSIzIiB0cmFuc2Zvcm09InJvdGF0ZSgxMjAsNjAsNjApIi8+PGNpcmNsZSBjeD0iNjAiIGN5PSI2MCIgcj0iOCIgZmlsbD0iIzYxZGFmYiIvPjwvc3ZnPg==',
          mediaType: 'image/svg+xml' as const,
          alt: 'React logo icon',
        },
      },
    ],
  },
  {
    key: nanoid(),
    from: 'user' as const,
    versions: [{ id: nanoid(), content: 'What TypeScript version does this project use?' }],
  },
  {
    key: nanoid(),
    from: 'assistant' as const,
    toolParts: [
      {
        type: 'Bash',
        state: 'output-available' as const,
        input: { command: 'cat package.json | grep typescript' },
        output: { result: '"typescript": "^5.6.0"' },
        toolCallId: 'toolu_01',
      },
    ],
    versions: [{ id: nanoid(), content: 'The project uses **TypeScript ^5.6.0** — a recent stable release with full ES2024 support and improved type inference.' }],
  },
  {
    key: nanoid(),
    from: 'user' as const,
    versions: [{ id: nanoid(), content: 'Try to read the missing config file.' }],
  },
  {
    key: nanoid(),
    from: 'assistant' as const,
    toolParts: [
      {
        type: 'ReadFile',
        state: 'output-error' as const,
        input: { path: './config/missing.json' },
        errorText: 'ENOENT: no such file or directory, open \'./config/missing.json\'',
        toolCallId: 'toolu_02',
      },
    ],
    versions: [{ id: nanoid(), content: "That file doesn't exist yet. Would you like me to create it with a default configuration?" }],
  },
];

// ---------------------------------------------------------------------------
// CodeBlockWithCopy — prompt-kit CodeBlock with inline header + copy button
// ---------------------------------------------------------------------------

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
          {filename && (
            <span className="text-xs text-zinc-400">{filename}</span>
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex size-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-700/60 hover:text-zinc-200"
        >
          {copied ? (
            <Check className="size-3.5 text-green-400" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </CodeBlockGroup>
      <CodeBlockCode code={code} language={language} />
    </CodeBlock>
  );
}

// ---------------------------------------------------------------------------
// ChatPreview
// ---------------------------------------------------------------------------

interface ChatPreviewProps {
  status?: SessionStatus;
}

export function ChatPreview({ status = 'idle' }: ChatPreviewProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Conversation>
        <ConversationContent>
          {MOCK_MESSAGES.map((msg) => (
            <MessageBranch defaultBranch={0} key={msg.key}>
              <MessageBranchContent>
                {msg.versions.map((version) => (
                  <Message from={msg.from} key={`${msg.key}-${version.id}`}>
                    <div className="space-y-2">
                      {/* Sources panel (ai-elements collapsible) */}
                      {'sources' in msg && msg.sources?.length ? (
                        <Sources>
                          <SourcesTrigger count={msg.sources.length} />
                          <SourcesContent>
                            {msg.sources.map((source) => (
                              <SourceLink href={source.href} key={source.href} title={source.title} />
                            ))}
                          </SourcesContent>
                        </Sources>
                      ) : null}

                      {/* Reasoning */}
                      {'reasoning' in msg && msg.reasoning ? (
                        <Reasoning>
                          <ReasoningTrigger className="text-xs text-muted-foreground">
                            Thought for {msg.reasoning.duration}s
                          </ReasoningTrigger>
                          <ReasoningContent markdown contentClassName="mt-2 text-xs">
                            {msg.reasoning.content}
                          </ReasoningContent>
                        </Reasoning>
                      ) : null}

                      {/* Steps with Sources */}
                      {'stepsWithSources' in msg && msg.stepsWithSources ? (
                        <Steps defaultOpen>
                          <StepsTrigger>{msg.stepsWithSources.trigger}</StepsTrigger>
                          <StepsContent>
                            {msg.stepsWithSources.items.map((item) => (
                              <StepsItem key={item}>{item}</StepsItem>
                            ))}
                            <div className="flex flex-wrap gap-1.5">
                              {msg.stepsWithSources.sources.map((src) => (
                                <Source key={src.href} href={src.href}>
                                  <SourceTrigger label={src.label} showFavicon />
                                  <SourceContent title={src.title} description={src.description} />
                                </Source>
                              ))}
                            </div>
                            <StepsItem>{msg.stepsWithSources.trailing}</StepsItem>
                          </StepsContent>
                        </Steps>
                      ) : null}

                      {/* Steps with TextShimmer trigger */}
                      {'stepsWithShimmer' in msg && msg.stepsWithShimmer ? (
                        <Steps defaultOpen>
                          <StepsTrigger>
                            <TextShimmer
                              className="text-sm"
                              style={{
                                backgroundImage:
                                  'linear-gradient(to right, #a1a1aa 0%, #71717a 40%, #a1a1aa 100%)',
                              }}
                            >
                              {msg.stepsWithShimmer.triggerText}
                            </TextShimmer>
                          </StepsTrigger>
                          <StepsContent>
                            {msg.stepsWithShimmer.items.map((item) => (
                              <StepsItem key={item}>{item}</StepsItem>
                            ))}
                          </StepsContent>
                        </Steps>
                      ) : null}

                      {/* Tool calls */}
                      {'toolParts' in msg && msg.toolParts?.length ? (
                        <div className="space-y-1.5">
                          {msg.toolParts.map((part) => (
                            <Tool key={part.toolCallId} toolPart={part} />
                          ))}
                        </div>
                      ) : null}

                      {/* Message text */}
                      <MessageContent>
                        <Markdown className="prose prose-sm dark:prose-invert">
                          {version.content}
                        </Markdown>
                      </MessageContent>

                      {/* Inline source chips (prompt-kit HoverCard style) */}
                      {'inlineSources' in msg && msg.inlineSources?.length ? (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {msg.inlineSources.map((src) => (
                            <Source key={src.href} href={src.href}>
                              <SourceTrigger showFavicon />
                              <SourceContent title={src.title} description={src.description} />
                            </Source>
                          ))}
                        </div>
                      ) : null}

                      {/* Code block (if present) */}
                      {'code' in version && version.code ? (
                        <CodeBlockWithCopy
                          code={version.code}
                          language={version.language ?? 'typescript'}
                          filename={version.filename}
                        />
                      ) : null}

                      {/* Image (if present) */}
                      {'image' in version && version.image ? (
                        <Image
                          alt={version.image.alt}
                          base64={version.image.base64}
                          className="max-h-48 w-auto rounded-lg"
                          mediaType={version.image.mediaType}
                        />
                      ) : null}
                    </div>
                  </Message>
                ))}
              </MessageBranchContent>
            </MessageBranch>
          ))}

          {/* Streaming indicator — visible while session is active */}
          {status === 'streaming' && (
            <Message from="assistant">
              <MessageContent>
                <div className="flex items-center gap-2.5 py-0.5">
                  <PulseLoader size="sm" className="[&>div]:border-purple-500" />
                  <TextShimmer
                    className="text-xs"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, #7c3aed 0%, #d946ef 50%, #7c3aed 100%)',
                    }}
                  >
                    Claude is working...
                  </TextShimmer>
                </div>
              </MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  );
}
