import "server-only";
import { env } from "@/lib/config/env";
import type { LlmMessage, LlmProvider, ToolSpec } from "./provider";

/** Gemini generateContent with functionDeclarations. Model via GEMINI_MODEL. */
const DEFAULT_MODEL = "gemini-2.5-flash";

/** Gemini's schema dialect rejects some JSON-Schema keys. */
function clean(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(clean);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema)) {
      if (k === "additionalProperties" || k === "$schema") continue;
      out[k] = clean(v);
    }
    return out;
  }
  return schema;
}

export const geminiProvider: LlmProvider = {
  name: "gemini",
  async chat(messages: LlmMessage[], tools: ToolSpec[]) {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages.filter((m) => m.role !== "system").map((m) => {
      if (m.role === "user") return { role: "user", parts: [{ text: m.content }] };
      if (m.role === "assistant") return { role: "model", parts: [...(m.content ? [{ text: m.content }] : []), ...(m.toolCalls ?? []).map((t) => ({ functionCall: { name: t.name, args: t.args ?? {} } }))] };
      if (m.role !== "tool") return { role: "user", parts: [{ text: m.content }] };
      let response: unknown;
      try { response = JSON.parse(m.content); } catch { response = { text: m.content }; }
      return { role: "user", parts: [{ functionResponse: { name: m.name, response: { result: response } } }] };
    });
    const model = env.GEMINI_MODEL || DEFAULT_MODEL;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": env.GEMINI_API_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: clean(t.parameters) })) }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; functionCall?: { name: string; args?: unknown } }[] } }[] };
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text).filter(Boolean).join("") || null;
    const toolCalls = parts.filter((p) => p.functionCall).map((p, i) => ({ id: `g${Date.now()}-${i}`, name: p.functionCall!.name, args: p.functionCall!.args ?? {} }));
    return { text, toolCalls };
  },
};
