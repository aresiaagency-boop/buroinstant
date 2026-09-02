import { z } from "zod";

export interface LLMProvider {
  chat(input: { system: string; messages: Array<{ role: "user" | "assistant"; content: string }> }): Promise<string>;
  structuredOutput<T>(input: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
  }): Promise<T>;
  classify(input: { text: string; labels: string[] }): Promise<{ label: string; confidence: number }>;
}

export class UnconfiguredLLMProvider implements LLMProvider {
  private unavailable(): never {
    throw new Error("LLM_PROVIDER_NOT_CONFIGURED");
  }
  async chat(): Promise<string> {
    return this.unavailable();
  }
  async structuredOutput<T>(): Promise<T> {
    return this.unavailable();
  }
  async classify(): Promise<{ label: string; confidence: number }> {
    return this.unavailable();
  }
}
