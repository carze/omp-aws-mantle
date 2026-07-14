import { describe, expect, test } from "bun:test";
import type { ExtensionAPI, ProviderConfig } from "@oh-my-pi/pi-coding-agent";
import { createAwsMantleExtension } from "../src/extension";

interface Registration {
  name: string;
  config: ProviderConfig;
}

function registrationHarness(): { pi: ExtensionAPI; registrations: Registration[] } {
  const registrations: Registration[] = [];
  const pi = {
    registerProvider(name: string, config: ProviderConfig) {
      registrations.push({ name, config });
    },
  } as ExtensionAPI;
  return { pi, registrations };
}

describe("AWS Mantle extension", () => {
  test("registers endpoint-family providers from one shared discovery", async () => {
    const { pi, registrations } = registrationHarness();
    const warnings: string[] = [];
    let discoveryRequests = 0;
    const extension = createAwsMantleExtension({
      environment: { AWS_MANTLE_REGION: "us-east-1" },
      fetch: async () => {
        discoveryRequests += 1;
        return Response.json({
          object: "list",
          data: [
            { id: "openai.gpt-oss-120b", object: "model" },
            { id: "openai.gpt-5.5", object: "model" },
            { id: "openai.gpt-5.6-luna", object: "model" },
            { id: "openai.gpt-5.6-sol", object: "model" },
            { id: "openai.gpt-5.6-terra", object: "model" },
            { id: "qwen.qwen3-coder-next", object: "model" },
            { id: "anthropic.claude-sonnet-5", object: "model" },
            { id: "brand-new-model", object: "model" },
          ],
        });
      },
      warn: message => warnings.push(message),
    });

    await extension(pi);

    expect(registrations).toHaveLength(3);
    const compat = registrations.find(registration => registration.name === "aws-mantle");
    const openAI = registrations.find(registration => registration.name === "aws-mantle-openai");
    const anthropic = registrations.find(registration => registration.name === "aws-mantle-anthropic");
    expect(compat?.config.baseUrl).toBe("https://bedrock-mantle.us-east-1.api.aws/v1");
    expect(openAI?.config.baseUrl).toBe("https://bedrock-mantle.us-east-1.api.aws/openai/v1");
    expect(anthropic?.config.baseUrl).toBe("https://bedrock-mantle.us-east-1.api.aws/anthropic/v1");
    expect(compat?.config.apiKey).toBe("AWS_BEARER_TOKEN_BEDROCK");
    expect(openAI?.config.apiKey).toBe("AWS_BEARER_TOKEN_BEDROCK");
    expect(anthropic?.config.apiKey).toBe("AWS_BEARER_TOKEN_BEDROCK");
    expect(compat?.config.streamSimple).toBeUndefined();
    expect(openAI?.config.streamSimple).toBeUndefined();
    expect(anthropic?.config.streamSimple).toBeUndefined();
    const [compatModels, openAIModels, anthropicModels] = await Promise.all([
      compat?.config.fetchDynamicModels?.("test-key"),
      openAI?.config.fetchDynamicModels?.("test-key"),
      anthropic?.config.fetchDynamicModels?.("test-key"),
    ]);
    expect(compatModels?.map(model => [model.id, model.api])).toEqual([
      ["openai.gpt-oss-120b", "openai-responses"],
      ["qwen.qwen3-coder-next", "openai-completions"],
    ]);
    expect(openAIModels?.map(model => [model.id, model.api])).toEqual([
      ["openai.gpt-5.5", "openai-responses"],
      ["openai.gpt-5.6-luna", "openai-responses"],
      ["openai.gpt-5.6-sol", "openai-responses"],
      ["openai.gpt-5.6-terra", "openai-responses"],
    ]);
    expect(anthropicModels?.map(model => [model.id, model.api])).toEqual([
      ["anthropic.claude-sonnet-5", "anthropic-messages"],
    ]);
    expect(discoveryRequests).toBe(1);
    expect(warnings).toEqual([
      "AWS Mantle omitted models without verified metadata: brand-new-model",
    ]);
  });

  test("evicts failed discovery and refreshes after credential rotation", async () => {
    const { pi, registrations } = registrationHarness();
    let attempts = 0;
    const extension = createAwsMantleExtension({
      environment: { AWS_MANTLE_REGION: "us-east-1" },
      fetch: async () => {
        attempts += 1;
        if (attempts === 1) return new Response(null, { status: 500 });
        return Response.json({ data: [{ id: "openai.gpt-oss-20b" }] });
      },
      warn: () => {},
    });
    await extension(pi);
    const fetchModels = registrations.find(registration => registration.name === "aws-mantle")
      ?.config.fetchDynamicModels;
    if (!fetchModels) throw new Error("provider did not register dynamic discovery");

    await expect(fetchModels("key-a")).rejects.toThrow("service error (HTTP 500)");
    await expect(fetchModels("key-a")).resolves.toHaveLength(1);
    await expect(fetchModels("key-a")).resolves.toHaveLength(1);
    expect(attempts).toBe(2);
    await expect(fetchModels("key-b")).resolves.toHaveLength(1);
    expect(attempts).toBe(3);
  });

  test("a reloaded extension owns a fresh discovery cache", async () => {
    let requests = 0;
    const options = {
      environment: { AWS_MANTLE_REGION: "us-east-1" as const },
      fetch: async () => {
        requests += 1;
        return Response.json({ data: [{ id: "openai.gpt-oss-20b" }] });
      },
      warn: () => {},
    };
    for (let reload = 0; reload < 2; reload += 1) {
      const { pi, registrations } = registrationHarness();
      await createAwsMantleExtension(options)(pi);
      const fetchModels = registrations.find(registration => registration.name === "aws-mantle")
        ?.config.fetchDynamicModels;
      await fetchModels?.("same-key");
    }
    expect(requests).toBe(2);
  });
});
