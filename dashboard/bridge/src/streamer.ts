import { supabase } from "../lib/supabase.js";

const CHUNK_SIZE = 800; // chars per chunk
const FLUSH_INTERVAL_MS = 500; // flush every 500ms

/**
 * Creates a buffered streamer that writes output chunks to agent_responses.
 * Buffers small writes and flushes periodically to avoid excessive DB writes.
 */
export function createStreamer(commandId: string) {
  let buffer = "";
  let timer: ReturnType<typeof setInterval> | null = null;

  async function flush() {
    if (buffer.length === 0) return;
    const content = buffer;
    buffer = "";

    const { error } = await supabase
      .from("agent_responses")
      .insert({ command_id: commandId, content, is_final: false });

    if (error) {
      console.error(`[streamer] Failed to write chunk:`, error.message);
    }
  }

  function start() {
    timer = setInterval(flush, FLUSH_INTERVAL_MS);
  }

  function write(text: string) {
    buffer += text;
    // If buffer is large enough, flush immediately
    if (buffer.length >= CHUNK_SIZE) {
      flush();
    }
  }

  async function end(exitCode: number | null) {
    // Flush remaining buffer
    if (buffer.length > 0) {
      await flush();
    }

    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    // Write final marker
    const { error } = await supabase
      .from("agent_responses")
      .insert({
        command_id: commandId,
        content: `\n[exit code: ${exitCode ?? "unknown"}]`,
        is_final: true,
      });

    if (error) {
      console.error(`[streamer] Failed to write final chunk:`, error.message);
    }
  }

  return { start, write, end };
}
