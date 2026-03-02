// Cursor Cloud Agents API client for the bridge daemon
// Mirror of dashboard/src/lib/cursor-client.ts adapted for bridge ESM
// Includes circuit breaker for resilience

import { CircuitBreaker } from "./circuit-breaker.js";

const BASE_URL = "https://api.cursor.com";

// Circuit breaker: 3 failures → 30s cooldown
const cursorBreaker = new CircuitBreaker("cursor-api", {
  failThreshold: 3,
  resetTimeout: 30_000,
});

export interface CursorAgentPrompt {
  text: string;
}

export interface LaunchAgentOptions {
  prompt: CursorAgentPrompt;
  source: { repository: string; ref?: string };
  model?: string;
}

export interface CursorAgentResponse {
  id: string;
  name: string;
  status: "CREATING" | "RUNNING" | "FINISHED" | "STOPPED" | "FAILED";
  source: { repository: string; ref: string };
  target: {
    branchName: string;
    url: string;
    prUrl?: string;
    autoCreatePr: boolean;
  };
  summary?: string;
  createdAt: string;
}

export interface CursorConversationMessage {
  id: string;
  type: "user_message" | "assistant_message";
  text: string;
}

export class CursorClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.CURSOR_API_KEY || "";
  }

  private headers(): Record<string, string> {
    const encoded = Buffer.from(this.apiKey + ":").toString("base64");
    return {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return cursorBreaker.call(async () => {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: this.headers(),
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Cursor API ${method} ${path} failed (${res.status}): ${text}`);
      }
      return res.json() as Promise<T>;
    });
  }

  async launchAgent(options: LaunchAgentOptions): Promise<CursorAgentResponse> {
    return this.request<CursorAgentResponse>("POST", "/v0/agents", options);
  }

  async getStatus(id: string): Promise<CursorAgentResponse> {
    return this.request<CursorAgentResponse>("GET", `/v0/agents/${id}`);
  }

  async getConversation(id: string): Promise<{ id: string; messages: CursorConversationMessage[] }> {
    return this.request("GET", `/v0/agents/${id}/conversation`);
  }

  async addFollowup(id: string, prompt: CursorAgentPrompt): Promise<{ id: string }> {
    return this.request("POST", `/v0/agents/${id}/followup`, { prompt });
  }

  async stopAgent(id: string): Promise<{ id: string }> {
    return this.request("POST", `/v0/agents/${id}/stop`);
  }
}
