import "server-only";
import { env } from "@/lib/config/env";
import type { LlmMessage, LlmProvider, ToolSpec } from "./provider";

/** OpenAI-compatible Chat Completions with function tools (OpenAI, DeepSeek). */
export function openAiCompatible(opts: { name: "openai" | "deepseek"; label: string; url: string; apiKey: () => string | undefined; model: () => string }): LlmProvider {
  return {
    name: opts.name,
    async chat(messages: LlmMessage[], tools: ToolSpec[]) {
      const body = {
        model: opts.model(),
        messages: messages.map((m) =>
          m.role === "tool" ? { role: "tool", tool_call_id: m.toolCallId, content: m.content }
          : m.role === "assistant" ? { role: "assistant", content: m.content || null, ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.args ?? {}) } })) } : {}) }
          : { role: m.role, content: m.content }),
        tools: tools.map((t) => ({ type: "function", function: t })),
        tool_choice: "auto",
      };
      const res = await fetch(opts.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.apiKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`${opts.label} HTTP ${res.status}`);
      const json = (await res.json()) as { choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] };
      const msg = json.choices[0]?.message;
      return {
        text: msg?.content ?? null,
        toolCalls: (msg?.tool_calls ?? []).map((t) => {
          let args: unknown = {};
          try { args = JSON.parse(t.function.arguments || "{}"); } catch { args = {}; }
          return { id: t.id, name: t.function.name, args };
        }),
      };
    },
  };
}

const DEFAULT_MODEL = "gpt-5-mini";

export const openaiProvider = openAiCompatible({
  name: "openai",
  label: "OpenAI",
  url: "https://api.openai.com/v1/chat/completions",
  apiKey: () => env.OPENAI_API_KEY,
  model: () => env.OPENAI_MODEL || DEFAULT_MODEL,
});
