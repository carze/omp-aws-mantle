import { describe, expect, test } from "bun:test";
import type { Api, Context, FetchImpl, Model } from "@oh-my-pi/pi-ai/types";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import type { ExtensionAPI, ProviderConfig } from "@oh-my-pi/pi-coding-agent";
import { createAwsMantleExtension } from "../src/extension";

function chatSseResponse(modelId: string): Response {
  const chunks = [
    {
      id: "mantle-1",
      object: "chat.completion.chunk",
      created: 0,
      model: modelId,
      choices: [{ index: 0, delta: { content: "Hello from Mantle" } }],
    },
    {
      id: "mantle-1",
      object: "chat.completion.chunk",
      created: 0,
      model: modelId,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
    },
  ];
  const body = `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}`).join("\n\n")}\n\ndata: [DONE]\n\n`;
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

describe("Mantle through the extension transport", () => {
  test("uses bearer auth for shared discovery and a streamed chat request", async () => {
    let discoveryRequest: Request | undefined;
    let inferenceRequest: Request | undefined;
    const registrations = new Map<string, ProviderConfig>();
    await createAwsMantleExtension({
      environment: { AWS_MANTLE_REGION: "us-east-1" },
      fetch: async (input, init) => {
        discoveryRequest = input instanceof Request && init === undefined ? input : new Request(input, init);
        return Response.json({ data: [{ id: "qwen.qwen3-coder-next" }] });
      },
      warn: () => {},
    })({
      registerProvider: (name: string, config: ProviderConfig) => {
        registrations.set(name, config);
      },
    } as ExtensionAPI);

    const provider = registrations.get("aws-mantle");
    const selected = (await provider?.fetchDynamicModels?.("mantle-test-key"))?.[0];
    if (!provider?.streamSimple || !provider.baseUrl || !selected?.api) {
      throw new Error("AWS Mantle chat provider did not register");
    }
    const model = buildModel({
      id: selected.id,
      name: selected.name,
      provider: "aws-mantle",
      baseUrl: provider.baseUrl,
      api: selected.api,
      reasoning: selected.reasoning,
      input: selected.input,
      cost: selected.cost,
      contextWindow: selected.contextWindow,
      maxTokens: selected.maxTokens,
      ...(selected.thinking ? { thinking: selected.thinking } : {}),
      ...(selected.compat ? { compat: selected.compat } : {}),
    }) as Model<Api>;
    const inferenceFetch: FetchImpl = async (input, init) => {
      inferenceRequest = input instanceof Request && init === undefined ? input : new Request(input, init);
      return chatSseResponse(model.id);
    };
    const context: Context = {
      messages: [{ role: "user", content: "Say hello", timestamp: Date.now() }],
    };

    const result = await provider.streamSimple(model, context, {
      apiKey: "mantle-test-key",
      fetch: inferenceFetch,
    }).result();

    expect(selected.api).toBe("aws-mantle-openai-compatible");
    expect(discoveryRequest?.url).toBe("https://bedrock-mantle.us-east-1.api.aws/v1/models");
    expect(discoveryRequest?.headers.get("authorization")).toBe("Bearer mantle-test-key");
    expect(inferenceRequest?.url).toBe("https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions");
    expect(inferenceRequest?.headers.get("authorization")).toBe("Bearer mantle-test-key");
    expect(await inferenceRequest?.clone().json()).toEqual(
      expect.objectContaining({
        model: "qwen.qwen3-coder-next",
        stream: true,
      }),
    );
    expect(result.content).toEqual([{ type: "text", text: "Hello from Mantle" }]);
    expect(result.stopReason).toBe("stop");
    expect(result.usage.input).toBe(7);
    expect(result.usage.output).toBe(3);
  });
});
