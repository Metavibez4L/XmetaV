import { supabase } from "../lib/supabase.js";

const CHUNK_SIZE = 160;           // chars per chunk — flush when reached (was 400)
const FLUSH_INTERVAL_MS = 80;     // flush every 80ms for smoother streaming (was 200)
const FIRST_FLUSH_MS = 30;        // first chunk fires fast (was 50)

/**
 * Creates a buffered streamer that writes output chunks to agent_responses.
 * Buffers small writes and flushes periodically to avoid excessive DB writes.
 *
 * Optimizations:
 *  - First chunk flushes in 30ms for fast time-to-first-byte
 *  - Subsequent flushes every 80ms or when buffer hits 160 chars
 *  - Concurrent-flush guard with retry (no lost chunks)
 *  - Non-blocking flushes (fire-and-forget with error logging)
 */
export function createStreamer(commandId: string) {
  let buffer = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let started = false;
  let flushing = false;
  let pendingFlush = false;

  async function flush() {
    if (buffer.length === 0) {
      scheduleNext();
      return;
    }
    if (flushing) {
      pendingFlush = true;
      return;
    }

    flushing = true;
    const content = buffer;
    buffer = "";

    try {
      const { error } = await supabase
        .from("agent_responses")
        .insert({ command_id: commandId, content, is_final: false });

      if (error) {
        console.error(`[streamer] Failed to write chunk:`, error.message);
        // Re-queue failed content so it's not lost
        buffer = content + buffer;
      }
    } finally {
      flushing = false;
      // If more data arrived while we were flushing, flush again immediately
      if (pendingFlush || buffer.length > 0) {
        pendingFlush = false;
        flush();
      } else {
        scheduleNext();
      }
    }
  }

  function scheduleNext() {
    if (!started) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, FLUSH_INTERVAL_MS);
  }

  function start() {
    started = true;
    // First flush fires quickly so the UI gets something fast
    timer = setTimeout(flush, FIRST_FLUSH_MS);
  }

  function write(text: string) {
    buffer += text;
    // If buffer is large enough, flush immediately
    if (buffer.length >= CHUNK_SIZE) {
      flush();
    }
  }

  async function end(exitCode: number | null) {
    started = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    // Flush remaining buffer
    if (buffer.length > 0) {
      const content = buffer;
      buffer = "";
      await supabase
        .from("agent_responses")
        .insert({ command_id: commandId, content, is_final: false });
    }

    // Small delay to ensure last chunk is received by realtime subscribers
    await new Promise(r => setTimeout(r, 40));

    // Write final marker (content is empty — is_final flag signals completion)
    const { error } = await supabase
      .from("agent_responses")
      .insert({
        command_id: commandId,
        content: "",
        is_final: true,
      });

    if (error) {
      console.error(`[streamer] Failed to write final chunk:`, error.message);
    }
  }

  return { start, write, end };
}
