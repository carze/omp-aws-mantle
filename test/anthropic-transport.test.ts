import { describe, expect, test } from "bun:test";
import type { Effort } from "@oh-my-pi/pi-ai";
import type { Api, Context, FetchImpl, Model } from "@oh-my-pi/pi-ai/types";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import type { ExtensionAPI, ProviderConfig } from "@oh-my-pi/pi-coding-agent";
import { createAwsMantleExtension } from "../src/extension";

function anthropicSse(events: readonly Record<string, unknown>[]): Response {
  const body = events.map(event => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

describe("Mantle Anthropic Messages transport", () => {
  test("uses SigV4 without an API-key header and normalizes the stream", async () => {
    const originalAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const originalSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const originalSessionToken = process.env.AWS_SESSION_TOKEN;
    const originalBearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
    process.env.AWS_ACCESS_KEY_ID = "AKIDANTHROPIC";
    process.env.AWS_SECRET_ACCESS_KEY = "anthropic-secret";
    process.env.AWS_SESSION_TOKEN = "anthropic-session";
    delete process.env.AWS_BEARER_TOKEN_BEDROCK;

    try {
      let discoveryRequest: Request | undefined;
      let inferenceRequest: Request | undefined;
      const registrations = new Map<string, ProviderConfig>();
      const profile = `mantle-anthropic-${crypto.randomUUID()}`;
      await createAwsMantleExtension({
        environment: { AWS_MANTLE_REGION: "us-east-1", AWS_PROFILE: profile },
        fetch: async (input, init) => {
          discoveryRequest = input instanceof Request && init === undefined ? input : new Request(input, init);
          return Response.json({ data: [{ id: "anthropic.claude-sonnet-5" }] });
        },
        warn: () => {},
      })({
        registerProvider: (name: string, config: ProviderConfig) => {
          registrations.set(name, config);
        },
      } as ExtensionAPI);

      const provider = registrations.get("aws-mantle-anthropic");
      const selected = (await provider?.fetchDynamicModels?.(undefined))?.[0];
      if (!provider?.streamSimple || !provider.baseUrl || !selected?.api) {
        throw new Error("AWS Mantle Anthropic provider did not register");
      }
      const model = buildModel({
        id: selected.id,
        name: selected.name,
        provider: "aws-mantle-anthropic",
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
      const context: Context = {
        messages: [{ role: "user", content: "Think, then answer", timestamp: 1 }],
      };
      const inferenceFetch: FetchImpl = async (input, init) => {
        inferenceRequest = input instanceof Request && init === undefined ? input : new Request(input, init);
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

      const result = await provider.streamSimple(model, context, {
        reasoning: "high" as Effort,
        fetch: inferenceFetch,
      }).result();
      const body = await inferenceRequest?.clone().json() as Record<string, unknown>;

      expect(selected.api).toBe("aws-mantle-anthropic-messages");
      expect(discoveryRequest?.headers.get("authorization")).toMatch(
        /Credential=AKIDANTHROPIC\/\d{8}\/us-east-1\/bedrock-mantle\/aws4_request/,
      );
      expect(inferenceRequest?.url).toBe("https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages");
      expect(inferenceRequest?.headers.get("authorization")).toMatch(
        /Credential=AKIDANTHROPIC\/\d{8}\/us-east-1\/bedrock-mantle\/aws4_request/,
      );
      expect(inferenceRequest?.headers.get("x-amz-security-token")).toBe("anthropic-session");
      expect(inferenceRequest?.headers.get("x-api-key")).toBeNull();
      expect(inferenceRequest?.headers.get("anthropic-version")).toBe("2023-06-01");
      expect(body.model).toBe("anthropic.claude-sonnet-5");
      expect(body.stream).toBe(true);
      expect(body).not.toHaveProperty("output_config");
      expect(result.stopReason).toBe("stop");
      expect(result.content).toEqual([
        expect.objectContaining({ type: "thinking", thinking: "Reasoning", thinkingSignature: "signature" }),
        expect.objectContaining({ type: "text", text: "Answer" }),
      ]);
      expect(result.usage).toEqual(expect.objectContaining({ input: 8, cacheRead: 2, output: 4 }));
    } finally {
      if (originalAccessKey === undefined) delete process.env.AWS_ACCESS_KEY_ID;
      else process.env.AWS_ACCESS_KEY_ID = originalAccessKey;
      if (originalSecretKey === undefined) delete process.env.AWS_SECRET_ACCESS_KEY;
      else process.env.AWS_SECRET_ACCESS_KEY = originalSecretKey;
      if (originalSessionToken === undefined) delete process.env.AWS_SESSION_TOKEN;
      else process.env.AWS_SESSION_TOKEN = originalSessionToken;
      if (originalBearerToken === undefined) delete process.env.AWS_BEARER_TOKEN_BEDROCK;
      else process.env.AWS_BEARER_TOKEN_BEDROCK = originalBearerToken;
    }
  });
});
