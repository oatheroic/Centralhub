import { ClaudeProvider } from "./claude.js";
import { LocalModelProvider } from "./local.js";
import type { InferenceProvider } from "./types.js";

export function createProvider(env: NodeJS.ProcessEnv): InferenceProvider {
  const provider = env.INFERENCE_PROVIDER ?? "claude";

  switch (provider) {
    case "claude": {
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is required when INFERENCE_PROVIDER=claude");
      }
      return new ClaudeProvider(apiKey, env.ANTHROPIC_MODEL ?? "claude-sonnet-5");
    }
    case "local": {
      const baseUrl = env.LOCAL_MODEL_BASE_URL;
      if (!baseUrl) {
        throw new Error("LOCAL_MODEL_BASE_URL is required when INFERENCE_PROVIDER=local");
      }
      return new LocalModelProvider(baseUrl, env.LOCAL_MODEL_NAME ?? "llama3.1");
    }
    default:
      throw new Error(`Unknown INFERENCE_PROVIDER: ${provider}`);
  }
}

export type { InferenceProvider, ChatMessage } from "./types.js";
