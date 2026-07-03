export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface InferenceProvider {
  readonly name: string;
  chat(messages: ChatMessage[]): Promise<string>;
}
