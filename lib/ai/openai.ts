import "server-only";
import { env } from "@/lib/config/env";
import type { LlmMessage, LlmProvider, ToolSpec } from "./provider";

/** OpenAI Chat Completions with function tools. Model via OPENAI_MODEL. */
const DEFAULT_MODEL = "gpt-5-mini";

export const openaiProvider: LlmProvider = {
  name: "openai",
  async chat(messages: LlmMessage[], tools: ToolSpec[]) {
    const body = {
      model: env.OPENAI_MODEL || DEFAULT_MODEL,
      messages: messages.map((m) =>
        m.role === "tool" ? { role: "tool", tool_call_id: m.toolCallId, content: m.content }
        : m.role === "assistant" ? { role: "assistant", content: m.content || null, ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.args ?? {}) } })) } : {}) }
        : { role: m.role, content: m.content }),
      tools: tools.map((t) => ({ type: "function", function: t })),
      tool_choice: "auto",
    };
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
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
