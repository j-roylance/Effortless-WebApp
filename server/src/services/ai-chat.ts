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

/** Calls onToken for each streamed content delta. Throws AiChatError if the request fails before or during streaming. */
export async function streamChatCompletion(
  messages: ChatMessage[],
  onToken: (token: string) => void,
  signal?: AbortSignal
): Promise<void> {
  if (!isAiConfigured()) throw new AiChatError("AI not configured", 503);

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(`${env.ai.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(env.ai.apiKey && { Authorization: `Bearer ${env.ai.apiKey}` }),
      },
      body: JSON.stringify({
        model: env.ai.model,
        messages,
        stream: true,
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
      }),
      signal: combined,
    });
  } catch (err) {
    if (timeout.aborted) throw new AiChatError("Model took too long to respond; try again", 504);
    if (signal?.aborted) return;
    throw new AiChatError(`Could not reach AI provider: ${(err as Error).message}`, 502);
  }

  if (!res.ok || !res.body) {
    const detail = await readErrorDetail(res);
    throw new AiChatError(friendlyUpstreamError(res.status, detail), 502);
  }

  const reader = res.body.getReader();
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
