// ============================================================
// Cursor Cloud Agents API Client
// Shared between Next.js API routes and bridge daemon
// Docs: https://cursor.com/docs/cloud-agent/api/endpoints
// ============================================================

const BASE_URL = "https://api.cursor.com";

// ---------- Types ----------

export interface CursorAgentSource {
  repository: string;
  ref?: string;
  prUrl?: string;
}

export interface CursorAgentTarget {
  autoCreatePr?: boolean;
  openAsCursorGithubApp?: boolean;
  skipReviewerRequest?: boolean;
  branchName?: string;
  autoBranch?: boolean;
}

export interface CursorAgentPrompt {
  text: string;
  images?: { data: string; dimension: { width: number; height: number } }[];
}

export interface LaunchAgentOptions {
  prompt: CursorAgentPrompt;
  source: CursorAgentSource;
  target?: CursorAgentTarget;
  model?: string;
}

export type CursorAgentStatus =
  | "CREATING"
  | "RUNNING"
  | "FINISHED"
  | "STOPPED"
  | "FAILED";

export interface CursorAgentResponse {
  id: string;
  name: string;
  status: CursorAgentStatus;
  source: {
    repository: string;
    ref: string;
  };
  target: {
    branchName: string;
    url: string;
    prUrl?: string;
    autoCreatePr: boolean;
    openAsCursorGithubApp: boolean;
    skipReviewerRequest: boolean;
  };
  summary?: string;
  createdAt: string;
}

export interface CursorConversationMessage {
  id: string;
  type: "user_message" | "assistant_message";
  text: string;
}

export interface CursorConversationResponse {
  id: string;
  messages: CursorConversationMessage[];
}

export interface CursorRepo {
  owner: string;
  name: string;
  repository: string;
}

// ---------- Client ----------

export class CursorClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.CURSOR_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("CURSOR_API_KEY is required");
    }
  }

  private headers(): Record<string, string> {
    const encoded = Buffer.from(this.apiKey + ":").toString("base64");
    return {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Cursor API ${method} ${path} failed (${res.status}): ${text}`
      );
    }

    return res.json() as Promise<T>;
  }

  // ---- Cloud Agents ----

  /** Launch a new cloud agent */
  async launchAgent(
    options: LaunchAgentOptions
  ): Promise<CursorAgentResponse> {
    return this.request<CursorAgentResponse>("POST", "/v0/agents", options);
  }

  /** Get agent status */
  async getStatus(id: string): Promise<CursorAgentResponse> {
    return this.request<CursorAgentResponse>("GET", `/v0/agents/${id}`);
  }

  /** Get agent conversation history */
  async getConversation(id: string): Promise<CursorConversationResponse> {
    return this.request<CursorConversationResponse>(
      "GET",
      `/v0/agents/${id}/conversation`
    );
  }

  /** Add a follow-up instruction */
  async addFollowup(
    id: string,
    prompt: CursorAgentPrompt
  ): Promise<{ id: string }> {
    return this.request<{ id: string }>(
      "POST",
      `/v0/agents/${id}/followup`,
      { prompt }
    );
  }

  /** Stop a running agent */
  async stopAgent(id: string): Promise<{ id: string }> {
    return this.request<{ id: string }>("POST", `/v0/agents/${id}/stop`);
  }

  /** Delete an agent */
  async deleteAgent(id: string): Promise<{ id: string }> {
    return this.request<{ id: string }>("DELETE", `/v0/agents/${id}`);
  }

  // ---- Metadata ----

  /** List available models */
  async listModels(): Promise<{ models: string[] }> {
    return this.request<{ models: string[] }>("GET", "/v0/models");
  }

  /** List accessible GitHub repos */
  async listRepos(): Promise<{ repositories: CursorRepo[] }> {
    return this.request<{ repositories: CursorRepo[] }>(
      "GET",
      "/v0/repositories"
    );
  }

  /** Get API key info */
  async getMe(): Promise<{
    apiKeyName: string;
    createdAt: string;
    userEmail: string;
  }> {
    return this.request("GET", "/v0/me");
  }
}

// ---------- Singleton helper ----------

let _client: CursorClient | null = null;

export function getCursorClient(): CursorClient {
  if (!_client) {
    _client = new CursorClient();
  }
  return _client;
}
