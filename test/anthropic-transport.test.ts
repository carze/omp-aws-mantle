import { describe, expect, test } from "bun:test";
import type { Effort } from "@oh-my-pi/pi-ai";
import { streamAnthropic } from "@oh-my-pi/pi-ai/providers/anthropic";
import type { Context, FetchImpl, Model } from "@oh-my-pi/pi-ai/types";
import { buildModel } from "@oh-my-pi/pi-catalog/build";

const baseUrl = "https://bedrock-mantle.us-east-1.api.aws/anthropic/v1";
const model = buildModel({
  id: "anthropic.claude-sonnet-5",
  name: "Claude Sonnet 5 (AWS Mantle)",
  provider: "aws-mantle-anthropic",
  api: "anthropic-messages",
  baseUrl,
  headers: { "X-Api-Key": "mantle-key" },
  reasoning: true,
  thinking: { mode: "anthropic-adaptive", efforts: ["low", "medium", "high", "max"] as readonly Effort[], supportsDisplay: true },
  input: ["text", "image"],
  cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  contextWindow: 1_000_000,
  maxTokens: 128_000,
}) as Model<"anthropic-messages">;
const context: Context = {
  messages: [{ role: "user", content: "Think, then answer", timestamp: 1 }],
};

function anthropicSse(events: readonly Record<string, unknown>[]): Response {
  const body = events.map(event => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

describe("Mantle Anthropic Messages transport", () => {
  test("uses Mantle headers and normalizes thinking, text, and usage", async () => {
    let request: Request | undefined;
    const fetchMock: FetchImpl = async (input, init) => {
      request = input instanceof Request && init === undefined ? input : new Request(input, init);
      return anthropicSse([
        { type: "message_start", message: { id: "msg_1", model: model.id, usage: { input_tokens: 8, output_tokens: 0, cache_read_input_tokens: 2, cache_creation_input_tokens: 0 } } },
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Reasoning" } },
        { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "signature" } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Answer" } },
        { type: "content_block_stop", index: 1 },
        { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { input_tokens: 8, output_tokens: 4, cache_read_input_tokens: 2, cache_creation_input_tokens: 0 } },
        { type: "message_stop" },
      ]);
    };

    const result = await streamAnthropic(model, context, {
      apiKey: "mantle-key",
      reasoning: "high" as Effort,
      fetch: fetchMock,
    }).result();
    const body = await request?.clone().json() as Record<string, unknown>;

    expect(request?.url).toBe(`${baseUrl}/messages`);
    expect(request?.headers.get("x-api-key")).toBe("mantle-key");
    expect(request?.headers.get("authorization")).toBe("Bearer mantle-key");
    expect(request?.headers.get("anthropic-version")).toBe("2023-06-01");
    expect(body.model).toBe("anthropic.claude-sonnet-5");
    expect(body.stream).toBe(true);
    expect(body).not.toHaveProperty("output_config");
    expect(result.stopReason).toBe("stop");
    expect(result.content).toEqual([
      expect.objectContaining({ type: "thinking", thinking: "Reasoning", thinkingSignature: "signature" }),
      expect.objectContaining({ type: "text", text: "Answer" }),
    ]);
    expect(result.usage).toEqual(expect.objectContaining({ input: 8, cacheRead: 2, output: 4 }));
  });
});
