import "server-only";
import { resolvedAiProvider } from "@/lib/config/env";
import { geminiProvider } from "./gemini";
import { openaiProvider } from "./openai";

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export type LlmMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface LlmTurn {
  text: string | null;
  toolCalls: ToolCall[];
}

/** Provider-agnostic chat-with-tools contract. Chosen via AI_PROVIDER. */
export interface LlmProvider {
  readonly name: "openai" | "gemini";
  chat(messages: LlmMessage[], tools: ToolSpec[]): Promise<LlmTurn>;
}

export function getLlm(): LlmProvider | null {
  const p = resolvedAiProvider();
  if (p === "openai") return openaiProvider;
  if (p === "gemini") return geminiProvider;
  return null; // mock analyst
}
