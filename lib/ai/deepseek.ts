import "server-only";
import { env } from "@/lib/config/env";
import { openAiCompatible } from "./openai";

/** DeepSeek speaks the OpenAI Chat Completions dialect. Model via DEEPSEEK_MODEL. */
const DEFAULT_MODEL = "deepseek-chat";

export const deepseekProvider = openAiCompatible({
  name: "deepseek",
  label: "DeepSeek",
  url: "https://api.deepseek.com/chat/completions",
  apiKey: () => env.DEEPSEEK_API_KEY,
  model: () => env.DEEPSEEK_MODEL || DEFAULT_MODEL,
});
