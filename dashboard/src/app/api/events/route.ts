import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events — Server-Sent Events stream for real-time dashboard updates.
 *
 * Subscribes to Supabase Realtime and streams:
 *   - agent_sessions changes (fleet status)
 *   - agent_memory inserts (new memories)
 *   - x402_payments inserts (revenue events)
 *   - agent_commands status changes (command lifecycle)
 *
 * Query params:
 *   ?channels=sessions,memory,payments,commands (default: all)
 *
 * Each SSE event:
 *   event: <channel>
 *   data: { table, eventType, new, old }
 */
export async function GET(request: NextRequest) {
  const channelParam = request.nextUrl.searchParams.get("channels") || "sessions,memory,payments,commands";
  const requestedChannels = new Set(channelParam.split(",").map((c) => c.trim()));

  const supabase = createAdminClient();

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ channels: [...requestedChannels], timestamp: new Date().toISOString() })}\n\n`)
      );

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        } catch {
          closed = true;
          clearInterval(heartbeat);
        }
      }, 30_000);

      const channels: ReturnType<typeof supabase.channel>[] = [];

      // ---- Agent Sessions ----
      if (requestedChannels.has("sessions")) {
        const ch = supabase
          .channel("sse-sessions")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "agent_sessions" },
            (payload) => {
              if (closed) return;
              try {
                controller.enqueue(
                  encoder.encode(
                    `event: sessions\ndata: ${JSON.stringify({
                      table: "agent_sessions",
                      eventType: payload.eventType,
                      new: payload.new,
                      old: payload.old,
                    })}\n\n`
                  )
                );
              } catch { closed = true; }
            }
          )
          .subscribe();
        channels.push(ch);
      }

      // ---- Agent Memory ----
      if (requestedChannels.has("memory")) {
        const ch = supabase
          .channel("sse-memory")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "agent_memory" },
            (payload) => {
              if (closed) return;
              try {
                controller.enqueue(
                  encoder.encode(
                    `event: memory\ndata: ${JSON.stringify({
                      table: "agent_memory",
                      eventType: "INSERT",
                      new: {
                        id: (payload.new as Record<string, unknown>).id,
                        agent_id: (payload.new as Record<string, unknown>).agent_id,
                        kind: (payload.new as Record<string, unknown>).kind,
                        source: (payload.new as Record<string, unknown>).source,
                        created_at: (payload.new as Record<string, unknown>).created_at,
                        // Truncate content to avoid huge payloads
                        content: String((payload.new as Record<string, unknown>).content || "").slice(0, 200),
                      },
                    })}\n\n`
                  )
                );
              } catch { closed = true; }
            }
          )
          .subscribe();
        channels.push(ch);
      }

      // ---- x402 Payments ----
      if (requestedChannels.has("payments")) {
        const ch = supabase
          .channel("sse-payments")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "x402_payments" },
            (payload) => {
              if (closed) return;
              try {
                controller.enqueue(
                  encoder.encode(
                    `event: payments\ndata: ${JSON.stringify({
                      table: "x402_payments",
                      eventType: "INSERT",
                      new: payload.new,
                    })}\n\n`
                  )
                );
              } catch { closed = true; }
            }
          )
          .subscribe();
        channels.push(ch);
      }

      // ---- Agent Commands ----
      if (requestedChannels.has("commands")) {
        const ch = supabase
          .channel("sse-commands")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "agent_commands" },
            (payload) => {
              if (closed) return;
              try {
                controller.enqueue(
                  encoder.encode(
                    `event: commands\ndata: ${JSON.stringify({
                      table: "agent_commands",
                      eventType: payload.eventType,
                      new: payload.new,
                      old: payload.old,
                    })}\n\n`
                  )
                );
              } catch { closed = true; }
            }
          )
          .subscribe();
        channels.push(ch);
      }

      // Cleanup on abort
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        channels.forEach((ch) => supabase.removeChannel(ch));
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
