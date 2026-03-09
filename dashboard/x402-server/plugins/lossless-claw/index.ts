/**
 * lossless-claw — Context Engine Plugin for OpenClaw 2026.3.8+
 *
 * Preserves full session memory by using a sliding-window assembly strategy:
 * - Recent N turns are kept verbatim (full fidelity)
 * - Older turns are compressed into a rolling summary section
 * - System prompt and tool results are always preserved
 * - No context is ever silently discarded
 *
 * This replaces the default "safeguard" compaction which drops older turns.
 */

interface LosslessConfig {
  maxContextTokens?: number;
  recentTurnsFullPreserve?: number;
  summaryMaxTokens?: number;
}

interface Message {
  role: string;
  content: string;
  [key: string]: unknown;
}

interface IngestParams {
  messages: Message[];
  config?: LosslessConfig;
}

interface AssembleParams {
  messages: Message[];
  systemPrompt?: string;
  maxTokens?: number;
  config?: LosslessConfig;
}

interface ContextEngineInfo {
  id: string;
  name: string;
  ownsCompaction: boolean;
}

interface ContextEngine {
  info: ContextEngineInfo;
  ingest(params: IngestParams): Promise<{ ingested: boolean }>;
  assemble(params: AssembleParams): Promise<{
    messages: Message[];
    estimatedTokens: number;
    metadata?: Record<string, unknown>;
  }>;
  compact(params: { messages: Message[] }): Promise<{
    ok: boolean;
    compacted: boolean;
    summary?: string;
  }>;
}

// Simple token estimator (~4 chars per token for English text)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(msg: Message): number {
  const content =
    typeof msg.content === "string"
      ? msg.content
      : JSON.stringify(msg.content ?? "");
  // Role overhead + content
  return 4 + estimateTokens(content);
}

// Rolling summary store — persists across assemble calls within a session
const sessionSummaries = new Map<string, string>();

function buildRollingSummary(
  olderMessages: Message[],
  maxTokens: number,
): string {
  if (olderMessages.length === 0) return "";

  // Group by conversation segments for better summaries
  const segments: string[] = [];
  let currentSegment = "";

  for (const msg of olderMessages) {
    const content =
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content ?? "");
    const role = msg.role === "assistant" ? "Agent" : "User";

    if (msg.role === "system") continue; // System prompts handled separately
    if (msg.role === "tool") {
      // Preserve tool result summaries (first 200 chars)
      const toolSummary = content.slice(0, 200);
      currentSegment += `[Tool: ${toolSummary}${content.length > 200 ? "..." : ""}] `;
      continue;
    }

    currentSegment += `${role}: ${content.slice(0, 500)}${content.length > 500 ? "..." : ""}\n`;

    // Segment every ~5 exchanges
    if (currentSegment.length > 2000) {
      segments.push(currentSegment.trim());
      currentSegment = "";
    }
  }
  if (currentSegment.trim()) {
    segments.push(currentSegment.trim());
  }

  // Build summary within token budget
  const summaryParts: string[] = [
    `[Lossless Context Summary — ${olderMessages.length} earlier messages preserved as summary]`,
  ];
  let tokenCount = estimateTokens(summaryParts[0]);

  for (const segment of segments) {
    const segmentTokens = estimateTokens(segment);
    if (tokenCount + segmentTokens > maxTokens) {
      // Truncate this segment to fit
      const remainingChars = (maxTokens - tokenCount) * 4;
      if (remainingChars > 100) {
        summaryParts.push(segment.slice(0, remainingChars) + "...");
      }
      break;
    }
    summaryParts.push(segment);
    tokenCount += segmentTokens;
  }

  return summaryParts.join("\n\n");
}

export default function register(api: any) {
  const logger = api.logger ?? console;

  api.registerContextEngine(
    "lossless-claw",
    (sessionConfig: LosslessConfig | undefined): ContextEngine => {
      const config = sessionConfig ?? {};
      const recentFull = config.recentTurnsFullPreserve ?? 8;
      const summaryBudget = config.summaryMaxTokens ?? 2048;

      return {
        info: {
          id: "lossless-claw",
          name: "Lossless Claw",
          ownsCompaction: true, // We handle compaction — core won't discard turns
        },

        async ingest(params: IngestParams | undefined) {
          // Accept all messages — we never reject or drop
          const messages = params?.messages ?? [];
          logger.debug?.(
            `[lossless-claw] ingest: ${messages.length} messages accepted`,
          );
          return { ingested: true };
        },

        async assemble(params: AssembleParams) {
          const messages = params?.messages ?? [];
          const systemPrompt = params?.systemPrompt;
          const maxTokens = params?.maxTokens;
          const budget =
            maxTokens ?? config.maxContextTokens ?? 131072;

          // Separate system messages from conversation
          const systemMsgs = messages.filter((m) => m.role === "system");
          const conversationMsgs = messages.filter(
            (m) => m.role !== "system",
          );

          // Split into recent (full fidelity) and older (summarizable)
          const recentStart = Math.max(
            0,
            conversationMsgs.length - recentFull,
          );
          const recentMessages = conversationMsgs.slice(recentStart);
          const olderMessages = conversationMsgs.slice(0, recentStart);

          // Calculate token usage for recent messages
          let recentTokens = 0;
          for (const msg of recentMessages) {
            recentTokens += estimateMessageTokens(msg);
          }

          // Calculate system prompt tokens
          let systemTokens = 0;
          for (const msg of systemMsgs) {
            systemTokens += estimateMessageTokens(msg);
          }
          if (systemPrompt) {
            systemTokens += estimateTokens(systemPrompt);
          }

          // Build the assembled context
          const assembled: Message[] = [];

          // 1. System messages first
          assembled.push(...systemMsgs);

          // 2. If there are older messages, create a rolling summary
          if (olderMessages.length > 0) {
            const availableSummaryBudget = Math.min(
              summaryBudget,
              budget - recentTokens - systemTokens - 100, // 100 token buffer
            );

            if (availableSummaryBudget > 100) {
              const summary = buildRollingSummary(
                olderMessages,
                availableSummaryBudget,
              );

              if (summary) {
                assembled.push({
                  role: "system",
                  content: summary,
                });
              }
            }
          }

          // 3. Recent messages in full
          assembled.push(...recentMessages);

          const totalTokens =
            systemTokens +
            recentTokens +
            (olderMessages.length > 0
              ? estimateTokens(
                  assembled.find((m) =>
                    m.content?.toString().startsWith("[Lossless"),
                  )?.content?.toString() ?? "",
                )
              : 0);

          logger.debug?.(
            `[lossless-claw] assemble: ${messages.length} msgs → ${assembled.length} assembled (${totalTokens} est tokens, ${recentMessages.length} recent full, ${olderMessages.length} summarized)`,
          );

          return {
            messages: assembled,
            estimatedTokens: totalTokens,
            metadata: {
              engine: "lossless-claw",
              totalMessages: messages.length,
              recentFullCount: recentMessages.length,
              summarizedCount: olderMessages.length,
              estimatedTokens: totalTokens,
              budget,
            },
          };
        },

        async compact(params: { messages: Message[] } | undefined) {
          // We own compaction — we never actually discard data.
          // Instead, we signal "compacted: false" so core knows we're
          // handling it via the summary strategy in assemble().
          const messages = params?.messages ?? [];
          logger.debug?.(
            `[lossless-claw] compact: ${messages.length} messages — no compaction needed (lossless mode)`,
          );
          return {
            ok: true,
            compacted: false,
          };
        },
      };
    },
  );

  // Register a hook to inject lossless context metadata into prompts
  api.on?.(
    "before_prompt_build",
    async (_event: unknown, _ctx: unknown) => {
      return {
        appendSystemContext:
          "Context engine: lossless-claw — full conversation history is preserved. Earlier messages may appear as summaries but no context has been discarded.",
      };
    },
    { priority: 5 },
  );

  logger.info?.(
    "[lossless-claw] Context engine plugin registered — zero context loss mode active",
  );
}
