import { describe, expect, test } from "bun:test";
import { streamOpenAICompletions } from "@oh-my-pi/pi-ai/providers/openai-completions";
import { streamOpenAIResponses } from "@oh-my-pi/pi-ai/providers/openai-responses";
import type { Context, FetchImpl, Model } from "@oh-my-pi/pi-ai/types";
import { buildModel } from "@oh-my-pi/pi-catalog/build";

const baseUrl = "https://bedrock-mantle.us-east-1.api.aws/v1";
const responsesModel = buildModel({
  id: "openai.gpt-oss-120b",
  name: "GPT OSS 120B",
  provider: "aws-mantle",
  api: "openai-responses",
  baseUrl,
  reasoning: true,
  input: ["text"],
  cost: { input: 0.15, output: 0.6, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128_000,
  maxTokens: 16_384,
}) as Model<"openai-responses">;
const chatModel = buildModel({
  id: "qwen.qwen3-coder-next",
  name: "Qwen3 Coder Next",
  provider: "aws-mantle",
  api: "openai-completions",
  baseUrl,
  reasoning: true,
  input: ["text"],
  cost: { input: 0.22, output: 1.8, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 131_072,
  maxTokens: 65_536,
}) as Model<"openai-completions">;
const gpt56Model = buildModel({
  id: "openai.gpt-5.6-terra",
  name: "GPT-5.6 Terra",
  provider: "aws-mantle-openai",
  api: "openai-responses",
  baseUrl: "https://bedrock-mantle.us-east-1.api.aws/openai/v1",
  reasoning: true,
  input: ["text", "image"],
  cost: { input: 2.75, output: 16.5, cacheRead: 0.28, cacheWrite: 3.44 },
  contextWindow: 272_000,
  maxTokens: 128_000,
}) as Model<"openai-responses">;
const context: Context = {
  messages: [{ role: "user", content: "Help", timestamp: 1 }],
};

function sse(events: readonly unknown[]): Response {
  const body = `${events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("")}`;
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

function chatChunk(extra: Record<string, unknown>): Record<string, unknown> {
  return { id: "chat-1", object: "chat.completion.chunk", created: 0, model: chatModel.id, ...extra };
}

describe("Mantle OpenAI transport contracts", () => {
  test("Responses uses bearer auth, the Mantle URL, and stateless streaming", async () => {
    let request: Request | undefined;
    const fetchMock: FetchImpl = async (input, init) => {
      request = input instanceof Request && init === undefined ? input : new Request(input, init);
      return sse([
        { type: "response.output_item.added", item: { type: "message", id: "msg_1", role: "assistant", status: "in_progress", content: [] } },
        { type: "response.content_part.added", item_id: "msg_1", part: { type: "output_text", text: "" } },
        { type: "response.output_text.delta", item_id: "msg_1", delta: "Mantle response" },
        { type: "response.output_item.done", item: { type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Mantle response" }] } },
        { type: "response.completed", response: { id: "resp_1", status: "completed", usage: { input_tokens: 6, output_tokens: 2, total_tokens: 8, input_tokens_details: { cached_tokens: 1 } } } },
      ]);
    };

    const result = await streamOpenAIResponses(responsesModel, context, {
      apiKey: "mantle-key",
      fetch: fetchMock,
    }).result();
    const body = await request?.clone().json() as Record<string, unknown>;

    expect(request?.url).toBe(`${baseUrl}/responses`);
    expect(request?.headers.get("authorization")).toBe("Bearer mantle-key");
    expect(body.store).toBe(false);
    expect(body.stream).toBe(true);
    expect(result.content).toEqual([expect.objectContaining({ type: "text", text: "Mantle response" })]);
    expect(result.usage).toEqual(expect.objectContaining({ input: 5, cacheRead: 1, output: 2 }));
  });

  test("GPT-5.6 uses the dedicated OpenAI endpoint and max reasoning tier", async () => {
    let request: Request | undefined;
    const fetchMock: FetchImpl = async (input, init) => {
      request = input instanceof Request && init === undefined ? input : new Request(input, init);
      return sse([
        { type: "response.output_item.added", item: { type: "message", id: "msg_56", role: "assistant", status: "in_progress", content: [] } },
        { type: "response.content_part.added", item_id: "msg_56", part: { type: "output_text", text: "" } },
        { type: "response.output_text.delta", item_id: "msg_56", delta: "OK" },
        { type: "response.output_item.done", item: { type: "message", id: "msg_56", role: "assistant", status: "completed", content: [{ type: "output_text", text: "OK" }] } },
        { type: "response.completed", response: { id: "resp_56", status: "completed", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
      ]);
    };

    const result = await streamOpenAIResponses(gpt56Model, context, {
      apiKey: "mantle-key",
      fetch: fetchMock,
      reasoning: "max",
    }).result();
    const body = await request?.clone().json() as Record<string, unknown>;

    expect(request?.url).toBe("https://bedrock-mantle.us-east-1.api.aws/openai/v1/responses");
    expect(body.reasoning).toEqual({ effort: "max", summary: "auto" });
    expect(result.content).toEqual([expect.objectContaining({ type: "text", text: "OK" })]);
  });

  test("Chat Completions heals fragmented tool arguments", async () => {
    const fetchMock: FetchImpl = async () => sse([
      chatChunk({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "read", arguments: '{"path":"src/' } }] } }] }),
      chatChunk({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'index.ts"}' } }] } }] }),
      chatChunk({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } }),
      "[DONE]",
    ]);

    const result = await streamOpenAICompletions(chatModel, context, {
      apiKey: "mantle-key",
      fetch: fetchMock,
    }).result();

    expect(result.stopReason).toBe("toolUse");
    expect(result.content).toEqual([
      expect.objectContaining({ type: "toolCall", id: "call_1", name: "read", arguments: { path: "src/index.ts" } }),
    ]);
    expect(result.usage).toEqual(expect.objectContaining({ input: 4, output: 3 }));
  });

  test.each([401, 429])("surfaces HTTP %i as a provider error without leaking the key", async status => {
    const result = await streamOpenAICompletions(chatModel, context, {
      apiKey: "never-leak-this",
      fetch: async () => Response.json(
        { error: { message: "denied" } },
        { status, headers: { "retry-after": "0" } },
      ),
      providerRetryWait: async () => {},
    }).result();

    expect(result.stopReason).toBe("error");
    expect(result.errorMessage).toContain(String(status));
    expect(result.errorMessage).not.toContain("never-leak-this");
  });
});
