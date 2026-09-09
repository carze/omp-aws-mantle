import { describe, expect, test } from "bun:test";
import { AUTHENTICATED_SENTINEL } from "@oh-my-pi/pi-ai/registry";
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
    let discoveryAuthorization: string | null = null;
    const extension = createAwsMantleExtension({
      environment: { AWS_MANTLE_REGION: "us-east-1", AWS_PROFILE: "injected-profile" },
      fetch: async (input, init) => {
        const request = input instanceof Request && init === undefined ? input : new Request(input, init);
        discoveryAuthorization = request.headers.get("authorization");
        discoveryRequests += 1;
        return Response.json({
          object: "list",
          data: [
            { id: "openai.gpt-oss-120b", object: "model" },
            { id: "openai.gpt-5.5", object: "model" },
            { id: "openai.gpt-5.6-luna", object: "model" },
            { id: "openai.gpt-5.6-sol", object: "model" },
            { id: "openai.gpt-5.6-terra", object: "model" },
            { id: "openai.gpt-6-astra", object: "model" },
            { id: "xai.grok-4.6", object: "model" },
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
    expect(compat?.config.apiKey).toBe(AUTHENTICATED_SENTINEL);
    expect(openAI?.config.apiKey).toBe(AUTHENTICATED_SENTINEL);
    expect(anthropic?.config.apiKey).toBe(AUTHENTICATED_SENTINEL);
    expect(compat?.config.api).toBe("aws-mantle-openai-compatible");
    expect(openAI?.config.api).toBe("aws-mantle-openai-responses");
    expect(anthropic?.config.api).toBe("aws-mantle-anthropic-messages");
    expect(compat?.config.streamSimple).toBeFunction();
    expect(openAI?.config.streamSimple).toBeFunction();
    expect(anthropic?.config.streamSimple).toBeFunction();
    const [compatModels, openAIModels, anthropicModels] = await Promise.all([
      compat?.config.fetchDynamicModels?.("test-key"),
      openAI?.config.fetchDynamicModels?.("test-key"),
      anthropic?.config.fetchDynamicModels?.("test-key"),
    ]);
    expect(compatModels?.map(model => [model.id, model.api])).toEqual([
      ["openai.gpt-oss-120b", "aws-mantle-openai-compatible"],
      ["qwen.qwen3-coder-next", "aws-mantle-openai-compatible"],
    ]);
    expect(openAIModels?.map(model => [model.id, model.api])).toEqual([
      ["openai.gpt-5.5", "aws-mantle-openai-responses"],
      ["openai.gpt-5.6-luna", "aws-mantle-openai-responses"],
      ["openai.gpt-5.6-sol", "aws-mantle-openai-responses"],
      ["openai.gpt-5.6-terra", "aws-mantle-openai-responses"],
      ["openai.gpt-6-astra", "aws-mantle-openai-responses"],
      ["xai.grok-4.6", "aws-mantle-openai-responses"],
    ]);
    expect(anthropicModels?.map(model => [model.id, model.api])).toEqual([
      ["anthropic.claude-sonnet-5", "aws-mantle-anthropic-messages"],
    ]);
    expect(String(discoveryAuthorization)).toBe("Bearer test-key");
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
