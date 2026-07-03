import type { ChatMessage, InferenceProvider } from "./types.js";

/**
 * Targets an Ollama-compatible /api/chat endpoint, so any local runtime that
 * speaks the Ollama HTTP protocol (Ollama itself, or a compatible shim in
 * front of llama.cpp/vLLM) works without further changes.
 */
export class LocalModelProvider implements InferenceProvider {
  readonly name = "local";

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Local model error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as { message: { content: string } };
    return data.message.content;
  }
}
