/**
 * Streams chat completions from any OpenAI-compatible endpoint
 * (Hugging Face Space running Ollama, HF Inference Providers, Groq, OpenRouter, local Ollama).
 */
import { env } from "../lib/env.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class AiChatError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 55_000;
const MAX_TOKENS = 800;

export function isAiConfigured(): boolean {
  return !!env.ai.baseUrl && !!env.ai.model;
}

function friendlyUpstreamError(status: number, detail: string): string {
  if (status === 401 || status === 403) return "AI provider rejected the API key";
  if (status === 404) return "AI model or endpoint not found; check AI_BASE_URL and AI_MODEL";
  if (status === 429) return "AI provider rate limit reached; try again shortly";
  if (status === 502 || status === 503 || status === 504) {
    return "Model is waking up or busy; try again in a minute";
  }
  return detail ? `AI provider error (${status}): ${detail}` : `AI provider error (${status})`;
}

async function readErrorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === "string") return parsed.error;
    return parsed.error?.message ?? parsed.message ?? "";
  } catch {
    return text.slice(0, 200);
  }
}

/** Returns null only when the caller's own signal aborted the request. */
async function postCompletion(
  body: Record<string, unknown>,
  timeout: AbortSignal,
  signal?: AbortSignal
): Promise<Response | null> {
  if (!isAiConfigured()) throw new AiChatError("AI not configured", 503);

  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch(`${env.ai.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: body.stream ? "text/event-stream" : "application/json",
        ...(env.ai.apiKey && { Authorization: `Bearer ${env.ai.apiKey}` }),
      },
      body: JSON.stringify({ model: env.ai.model, ...body }),
      signal: combined,
    });
  } catch (err) {
    if (timeout.aborted) throw new AiChatError("Model took too long to respond; try again", 504);
    if (signal?.aborted) return null;
    throw new AiChatError(`Could not reach AI provider: ${(err as Error).message}`, 502);
  }

  if (!res.ok || !res.body) {
    const detail = await readErrorDetail(res);
    throw new AiChatError(friendlyUpstreamError(res.status, detail), 502);
  }
  return res;
}

/** Reasoning models (e.g. Qwen3) may prefix replies with a <think> block. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/gi, "").trim();
}

/** Single non-streamed reply, used for short structured asks like naming a goal. */
export async function completeChat(
  messages: ChatMessage[],
  { maxTokens = 400, temperature = 0.3 }: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const res = await postCompletion(
    { messages, stream: false, max_tokens: maxTokens, temperature },
    timeout
  );
  let data: { choices?: { message?: { content?: string | null } }[] };
  try {
    data = (await res!.json()) as typeof data;
  } catch {
    if (timeout.aborted) throw new AiChatError("Model took too long to respond; try again", 504);
    throw new AiChatError("AI provider returned an unreadable response", 502);
  }
  const content = stripThinking(data.choices?.[0]?.message?.content ?? "");
  if (!content) throw new AiChatError("AI returned an empty reply; try again", 502);
  return content;
}

const MAX_LIST_ITEMS = 15;
const MAX_ITEM_LENGTH = 120;

/** Cleans one model-written name: strips list markers, markdown emphasis, wrapping quotes, trailing period. */
export function cleanName(raw: string): string {
  let text = raw
    .replace(/\*\*|__|`/g, "")
    .trim()
    .replace(/^(\d+[.)]|[-*•]|step\s*\d+\s*[:.)-])\s+/i, "")
    .replace(/^(goal|vision|name)\s*:\s*/i, "")
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\.$/, "")
    .trim();
  if (text.length > MAX_ITEM_LENGTH) text = `${text.slice(0, MAX_ITEM_LENGTH - 1).trimEnd()}…`;
  return text;
}

/** Turns a numbered or bulleted reply into clean names, ignoring headings and blank lines. */
export function parseList(text: string): string[] {
  const lines = stripThinking(text).split("\n");
  const listLines = lines.filter((line) => /^\s*(\d+[.)]|[-*•])\s+/.test(line));
  const source = listLines.length > 0 ? listLines : lines;
  return source
    .map(cleanName)
    .filter((name) => name.length > 0 && !name.endsWith(":"))
    .slice(0, MAX_LIST_ITEMS);
}

/** Calls onToken for each streamed content delta. Throws AiChatError if the request fails before or during streaming. */
export async function streamChatCompletion(
  messages: ChatMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const res = await postCompletion(
    { messages, stream: true, max_tokens: MAX_TOKENS, temperature: 0.7 },
    timeout,
    signal
  );
  if (!res) return;

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();
        if (data === "[DONE]") return;

        try {
          const chunk = JSON.parse(data) as {
            choices?: { delta?: { content?: string | null } }[];
            error?: { message?: string } | string;
          };
          if (chunk.error) {
            const message = typeof chunk.error === "string" ? chunk.error : chunk.error.message;
            throw new AiChatError(message ?? "AI provider error", 502);
          }
          const token = chunk.choices?.[0]?.delta?.content;
          if (token) onToken(token);
        } catch (err) {
          if (err instanceof AiChatError) throw err;
        }
      }
    }
  } catch (err) {
    if (err instanceof AiChatError) throw err;
    if (timeout.aborted) throw new AiChatError("Model took too long to respond; try again", 504);
    if (signal?.aborted) return;
    throw new AiChatError(`AI stream interrupted: ${(err as Error).message}`, 502);
  } finally {
    reader.releaseLock();
  }
}
