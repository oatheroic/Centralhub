import type { ChatMessage, InferenceProvider } from "./types.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export class ClaudeProvider implements InferenceProvider {
  readonly name = "claude";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const system = messages.find((m) => m.role === "system")?.content;
    const rest = messages.filter((m) => m.role !== "system");

    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system,
        messages: rest,
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude API error ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      content: { type: string; text?: string }[];
    };
    return data.content.find((b) => b.type === "text")?.text ?? "";
  }
}
