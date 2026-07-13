import { describe, expect, test } from "bun:test";
import { streamOpenAICompletions } from "@oh-my-pi/pi-ai/providers/openai-completions";
import type { Context, FetchImpl, Model } from "@oh-my-pi/pi-ai/types";
import { getBundledModel } from "@oh-my-pi/pi-catalog/models";

const model = {
  ...(getBundledModel("openai", "gpt-4o-mini") as Model<"openai-completions">),
  id: "openai.gpt-oss-120b",
  name: "GPT OSS 120B (AWS Mantle)",
  provider: "aws-mantle",
  api: "openai-completions",
  baseUrl: "https://bedrock-mantle.us-east-1.api.aws/v1",
  reasoning: true,
  input: ["text"],
  contextWindow: 131_072,
  maxTokens: 16_384,
} satisfies Model<"openai-completions">;

function chatSseResponse(): Response {
  const chunks = [
    {
      id: "mantle-1",
      object: "chat.completion.chunk",
      created: 0,
      model: model.id,
      choices: [{ index: 0, delta: { content: "Hello from Mantle" } }],
    },
    {
      id: "mantle-1",
      object: "chat.completion.chunk",
      created: 0,
      model: model.id,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
    },
  ];
  const body = `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}`).join("\n\n")}\n\ndata: [DONE]\n\n`;
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

describe("Mantle through Oh My Pi OpenAI chat transport", () => {
  test("sends the expected request and normalizes streamed text and usage", async () => {
    let request: Request | undefined;
    const fetchMock: FetchImpl = async (input, init) => {
      request = input instanceof Request && init === undefined ? input : new Request(input, init);
      return chatSseResponse();
    };
    const context: Context = {
      messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
    };

    const result = await streamOpenAICompletions(model, context, {
      apiKey: "mantle-test-key",
      fetch: fetchMock,
    }).result();

    expect(request?.url).toBe("https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions");
    expect(request?.headers.get("authorization")).toBe("Bearer mantle-test-key");
    expect(await request?.clone().json()).toEqual(
      expect.objectContaining({
        model: "openai.gpt-oss-120b",
        stream: true,
      }),
    );
    expect(result.content).toEqual([{ type: "text", text: "Hello from Mantle" }]);
    expect(result.stopReason).toBe("stop");
    expect(result.usage.input).toBe(7);
    expect(result.usage.output).toBe(3);
  });
});
