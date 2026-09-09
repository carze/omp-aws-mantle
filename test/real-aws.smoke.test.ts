import { expect, test } from "bun:test";
import { NO_AUTH_SENTINEL } from "@oh-my-pi/pi-ai/providers/openai-shared";
import { streamOpenAIResponses } from "@oh-my-pi/pi-ai/providers/openai-responses";
import type { Context, Model } from "@oh-my-pi/pi-ai/types";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import { createMantleAuthenticatedFetch, resolveMantleBearerToken } from "../src/auth";
import { resolveMantleConfig } from "../src/config";
import { discoverMantleModels } from "../src/discover-models";
import { selectOpenAIResponsesModels } from "../src/model-catalog";

const runRealSmoke = process.env.AWS_MANTLE_REAL_SMOKE === "1";

test.skipIf(!runRealSmoke)("lists and streams GPT-5.6 Terra through its dedicated endpoint", async () => {
  const bearerToken = resolveMantleBearerToken();
  const config = resolveMantleConfig();
  const authenticatedFetch = createMantleAuthenticatedFetch({
    region: config.region,
    ...(config.profile ? { profile: config.profile } : {}),
    ...(bearerToken ? { bearerToken } : {}),
  });
  const discovered = await discoverMantleModels({
    baseUrl: config.compatBaseUrl,
    fetch: authenticatedFetch,
  });
  expect(discovered.length).toBeGreaterThan(0);

  const selected = selectOpenAIResponsesModels(discovered).find(model => model.id === "openai.gpt-5.6-terra");
  expect(selected).toBeDefined();
  if (!selected) throw new Error("AWS Mantle did not advertise openai.gpt-5.6-terra");
  if (selected.api !== "openai-responses") throw new Error("GPT-5.6 Terra must use OpenAI Responses");
  const model = buildModel({
    id: selected.id,
    name: selected.name,
    api: selected.api,
    provider: "aws-mantle-smoke",
    baseUrl: config.openAIBaseUrl,
    reasoning: selected.reasoning,
    input: selected.input,
    cost: selected.cost,
    contextWindow: selected.contextWindow,
    maxTokens: selected.maxTokens,
    ...(selected.thinking ? { thinking: selected.thinking } : {}),
    ...(selected.premiumMultiplier === undefined ? {} : { premiumMultiplier: selected.premiumMultiplier }),
    ...(selected.headers ? { headers: selected.headers } : {}),
  });
  const context: Context = {
    messages: [{ role: "user", content: "Reply with exactly OK", timestamp: Date.now() }],
  };
  const options = {
    apiKey: bearerToken ?? NO_AUTH_SENTINEL,
    fetch: authenticatedFetch,
    maxTokens: 32,
  };
  const result = await streamOpenAIResponses(
    model as Model<"openai-responses">,
    context,
    options,
  ).result();

  expect(result.stopReason).not.toBe("error");
  expect(result.content.length).toBeGreaterThan(0);
}, 120_000);
