import { expect, test } from "bun:test";
import { streamOpenAIResponses } from "@oh-my-pi/pi-ai/providers/openai-responses";
import type { Context, Model } from "@oh-my-pi/pi-ai/types";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import { resolveMantleConfig } from "../src/config";
import { discoverMantleModels } from "../src/discover-models";
import { selectOpenAIResponsesModels } from "../src/model-catalog";

const apiKey = process.env.AWS_BEARER_TOKEN_BEDROCK;
const hasRegion = Boolean(
  process.env.AWS_MANTLE_REGION || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
);

test.skipIf(!apiKey || !hasRegion)("lists and streams GPT-5.5 through its dedicated endpoint", async () => {
  if (!apiKey) throw new Error("AWS_BEARER_TOKEN_BEDROCK is required");
  const config = resolveMantleConfig();
  const discovered = await discoverMantleModels({ baseUrl: config.compatBaseUrl, apiKey });
  expect(discovered.length).toBeGreaterThan(0);

  const selected = selectOpenAIResponsesModels(discovered).find(model => model.id === "openai.gpt-5.5");
  expect(selected).toBeDefined();
  if (!selected) throw new Error("AWS Mantle did not advertise openai.gpt-5.5");
  if (selected.api !== "openai-responses") throw new Error("GPT-5.5 must use OpenAI Responses");
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
  const options = { apiKey, maxTokens: 32 };
  const result = await streamOpenAIResponses(
    model as Model<"openai-responses">,
    context,
    options,
  ).result();

  expect(result.stopReason).not.toBe("error");
  expect(result.content.length).toBeGreaterThan(0);
}, 120_000);
