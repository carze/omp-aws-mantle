import type { Effort } from "@oh-my-pi/pi-ai";
import type { ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";

const ADAPTIVE_EFFORTS = ["low", "medium", "high", "max"] as readonly Effort[];
const BUDGET_EFFORTS = ["minimal", "low", "medium", "high"] as readonly Effort[];

/**
 * Exact Mantle Messages IDs and limits from the Amazon Bedrock model cards.
 * Mantle rejects Anthropic `output_config.format`, so no structured-output
 * compatibility is declared here.
 * https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html
 */
export const MANTLE_ANTHROPIC_MODELS = {
  "anthropic.claude-fable-5": {
    id: "anthropic.claude-fable-5",
    name: "Claude Fable 5 (AWS Mantle)",
    api: "anthropic-messages",
    headers: { "X-Api-Key": "AWS_BEARER_TOKEN_BEDROCK" },
    reasoning: true,
    thinking: { mode: "anthropic-adaptive", efforts: ADAPTIVE_EFFORTS, supportsDisplay: true },
    input: ["text", "image"],
    cost: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  "anthropic.claude-haiku-4-5": {
    id: "anthropic.claude-haiku-4-5",
    name: "Claude Haiku 4.5 (AWS Mantle)",
    api: "anthropic-messages",
    headers: { "X-Api-Key": "AWS_BEARER_TOKEN_BEDROCK" },
    reasoning: true,
    thinking: { mode: "budget", efforts: BUDGET_EFFORTS },
    input: ["text", "image"],
    cost: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
    contextWindow: 200_000,
    maxTokens: 64_000,
  },
  "anthropic.claude-opus-4-7": {
    id: "anthropic.claude-opus-4-7",
    name: "Claude Opus 4.7 (AWS Mantle)",
    api: "anthropic-messages",
    headers: { "X-Api-Key": "AWS_BEARER_TOKEN_BEDROCK" },
    reasoning: true,
    thinking: { mode: "anthropic-adaptive", efforts: ADAPTIVE_EFFORTS, supportsDisplay: true },
    input: ["text", "image"],
    cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  "anthropic.claude-opus-4-8": {
    id: "anthropic.claude-opus-4-8",
    name: "Claude Opus 4.8 (AWS Mantle)",
    api: "anthropic-messages",
    headers: { "X-Api-Key": "AWS_BEARER_TOKEN_BEDROCK" },
    reasoning: true,
    thinking: { mode: "anthropic-adaptive", efforts: ADAPTIVE_EFFORTS, supportsDisplay: true },
    input: ["text", "image"],
    cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  "anthropic.claude-sonnet-5": {
    id: "anthropic.claude-sonnet-5",
    name: "Claude Sonnet 5 (AWS Mantle)",
    api: "anthropic-messages",
    headers: { "X-Api-Key": "AWS_BEARER_TOKEN_BEDROCK" },
    reasoning: true,
    thinking: { mode: "anthropic-adaptive", efforts: ADAPTIVE_EFFORTS, supportsDisplay: true },
    input: ["text", "image"],
    cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
} as const satisfies Record<string, ProviderModelConfig>;

export function isKnownAnthropicModelId(id: string): id is keyof typeof MANTLE_ANTHROPIC_MODELS {
  return Object.hasOwn(MANTLE_ANTHROPIC_MODELS, id);
}

export function selectAnthropicModels(
  discovered: readonly { readonly id: string }[],
): readonly ProviderModelConfig[] {
  const selected: Record<string, ProviderModelConfig> = {};
  for (const { id } of discovered) {
    if (isKnownAnthropicModelId(id)) selected[id] = MANTLE_ANTHROPIC_MODELS[id];
  }
  return Object.keys(selected).sort().map(id => selected[id] as ProviderModelConfig);
}
