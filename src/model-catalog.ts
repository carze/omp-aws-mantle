import type { ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";

/**
 * Mantle IDs, API support, limits and modalities are synchronized from the
 * Amazon Bedrock model cards and API compatibility matrix:
 * https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html
 * https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html
 * Costs are USD per million tokens and match the OMP 16.4.1 Bedrock catalog.
 */
export const MANTLE_OPENAI_MODELS = {
  "deepseek.v3.1": {
    id: "deepseek.v3.1", name: "DeepSeek V3.1 (AWS Mantle)", api: "openai-completions", reasoning: true,
    input: ["text"], cost: { input: 0.58, output: 1.68, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 8_192,
  },
  "deepseek.v3.2": {
    id: "deepseek.v3.2", name: "DeepSeek V3.2 (AWS Mantle)", api: "openai-completions", reasoning: true,
    input: ["text"], cost: { input: 0.62, output: 1.85, cacheRead: 0, cacheWrite: 0 }, contextWindow: 163_840, maxTokens: 81_920,
  },
  "google.gemma-3-27b-it": {
    id: "google.gemma-3-27b-it", name: "Gemma 3 27B Instruct (AWS Mantle)", api: "openai-completions", reasoning: false,
    input: ["text", "image"], cost: { input: 0.12, output: 0.2, cacheRead: 0, cacheWrite: 0 }, contextWindow: 202_752, maxTokens: 8_192,
  },
  "google.gemma-3-4b-it": {
    id: "google.gemma-3-4b-it", name: "Gemma 3 4B Instruct (AWS Mantle)", api: "openai-completions", reasoning: false,
    input: ["text", "image"], cost: { input: 0.04, output: 0.08, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 4_096,
  },
  "minimax.minimax-m2": {
    id: "minimax.minimax-m2", name: "MiniMax M2 (AWS Mantle)", api: "openai-completions", reasoning: true,
    input: ["text"], cost: { input: 0.3, output: 1.2, cacheRead: 0, cacheWrite: 0 }, contextWindow: 204_608, maxTokens: 128_000,
  },
  "minimax.minimax-m2.1": {
    id: "minimax.minimax-m2.1", name: "MiniMax M2.1 (AWS Mantle)", api: "openai-completions", reasoning: true,
    input: ["text"], cost: { input: 0.3, output: 1.2, cacheRead: 0, cacheWrite: 0 }, contextWindow: 204_800, maxTokens: 131_072,
  },
  "minimax.minimax-m2.5": {
    id: "minimax.minimax-m2.5", name: "MiniMax M2.5 (AWS Mantle)", api: "openai-completions", reasoning: true,
    input: ["text"], cost: { input: 0.3, output: 1.2, cacheRead: 0, cacheWrite: 0 }, contextWindow: 196_608, maxTokens: 98_304,
  },
  "mistral.devstral-2-123b": {
    id: "mistral.devstral-2-123b", name: "Devstral 2 123B (AWS Mantle)", api: "openai-completions", reasoning: false,
    input: ["text"], cost: { input: 0.4, output: 2, cacheRead: 0, cacheWrite: 0 }, contextWindow: 256_000, maxTokens: 8_192,
  },
  "mistral.magistral-small-2509": {
    id: "mistral.magistral-small-2509", name: "Magistral Small 2509 (AWS Mantle)", api: "openai-completions", reasoning: true,
    input: ["text", "image"], cost: { input: 0.5, output: 1.5, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 40_000,
  },
  "mistral.ministral-3-14b-instruct": {
    id: "mistral.ministral-3-14b-instruct", name: "Ministral 3 14B (AWS Mantle)", api: "openai-completions", reasoning: false,
    input: ["text"], cost: { input: 0.2, output: 0.2, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 4_096,
  },
  "mistral.ministral-3-3b-instruct": {
    id: "mistral.ministral-3-3b-instruct", name: "Ministral 3 3B (AWS Mantle)", api: "openai-completions", reasoning: false,
    input: ["text", "image"], cost: { input: 0.1, output: 0.1, cacheRead: 0, cacheWrite: 0 }, contextWindow: 256_000, maxTokens: 8_192,
  },
  "mistral.ministral-3-8b-instruct": {
    id: "mistral.ministral-3-8b-instruct", name: "Ministral 3 8B (AWS Mantle)", api: "openai-completions", reasoning: false,
    input: ["text"], cost: { input: 0.15, output: 0.15, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 4_096,
  },
  "mistral.mistral-large-3-675b-instruct": {
    id: "mistral.mistral-large-3-675b-instruct", name: "Mistral Large 3 (AWS Mantle)", api: "openai-completions", reasoning: false,
    input: ["text", "image"], cost: { input: 0.5, output: 1.5, cacheRead: 0, cacheWrite: 0 }, contextWindow: 256_000, maxTokens: 8_192,
  },
  "moonshotai.kimi-k2.5": {
    id: "moonshotai.kimi-k2.5", name: "Kimi K2.5 (AWS Mantle)", api: "openai-completions", reasoning: true,
    input: ["text", "image"], cost: { input: 0.6, output: 3, cacheRead: 0, cacheWrite: 0 }, contextWindow: 262_143, maxTokens: 16_000,
  },
  "nvidia.nemotron-nano-12b-v2": {
    id: "nvidia.nemotron-nano-12b-v2", name: "Nemotron Nano 12B v2 VL (AWS Mantle)", api: "openai-completions", reasoning: false,
    input: ["text", "image"], cost: { input: 0.2, output: 0.6, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 4_096,
  },
  "nvidia.nemotron-nano-3-30b": {
    id: "nvidia.nemotron-nano-3-30b", name: "Nemotron Nano 3 30B (AWS Mantle)", api: "openai-completions", reasoning: true,
    input: ["text"], cost: { input: 0.06, output: 0.24, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 4_096,
  },
  "nvidia.nemotron-nano-9b-v2": {
    id: "nvidia.nemotron-nano-9b-v2", name: "Nemotron Nano 9B v2 (AWS Mantle)", api: "openai-completions", reasoning: false,
    input: ["text"], cost: { input: 0.06, output: 0.23, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 4_096,
  },
  "nvidia.nemotron-super-3-120b": {
    id: "nvidia.nemotron-super-3-120b", name: "Nemotron 3 Super 120B (AWS Mantle)", api: "openai-completions", reasoning: true,
    input: ["text"], cost: { input: 0.15, output: 0.65, cacheRead: 0, cacheWrite: 0 }, contextWindow: 262_144, maxTokens: 131_072,
  },
  "openai.gpt-oss-120b": {
    id: "openai.gpt-oss-120b", name: "GPT OSS 120B (AWS Mantle)", api: "openai-responses", reasoning: true,
    input: ["text"], cost: { input: 0.15, output: 0.6, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 16_384,
  },
  "openai.gpt-oss-20b": {
    id: "openai.gpt-oss-20b", name: "GPT OSS 20B (AWS Mantle)", api: "openai-responses", reasoning: true,
    input: ["text"], cost: { input: 0.07, output: 0.3, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 16_384,
  },
  "qwen.qwen3-235b-a22b-2507": {
    id: "qwen.qwen3-235b-a22b-2507", name: "Qwen3 235B A22B 2507 (AWS Mantle)", api: "openai-completions", reasoning: false,
    input: ["text"], cost: { input: 0.22, output: 0.88, cacheRead: 0, cacheWrite: 0 }, contextWindow: 262_144, maxTokens: 131_072,
  },
  "qwen.qwen3-32b": {
    id: "qwen.qwen3-32b", name: "Qwen3 32B (AWS Mantle)", api: "openai-completions", reasoning: true,
    input: ["text"], cost: { input: 0.15, output: 0.6, cacheRead: 0, cacheWrite: 0 }, contextWindow: 16_384, maxTokens: 16_384,
  },
  "qwen.qwen3-coder-30b-a3b-instruct": {
    id: "qwen.qwen3-coder-30b-a3b-instruct", name: "Qwen3 Coder 30B A3B (AWS Mantle)", api: "openai-completions", reasoning: false,
    input: ["text"], cost: { input: 0.15, output: 0.6, cacheRead: 0, cacheWrite: 0 }, contextWindow: 262_144, maxTokens: 131_072,
  },
  "qwen.qwen3-coder-480b-a35b-instruct": {
    id: "qwen.qwen3-coder-480b-a35b-instruct", name: "Qwen3 Coder 480B A35B (AWS Mantle)", api: "openai-completions", reasoning: false,
    input: ["text"], cost: { input: 0.22, output: 1.8, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128_000, maxTokens: 16_384,
  },
  "qwen.qwen3-coder-next": {
    id: "qwen.qwen3-coder-next", name: "Qwen3 Coder Next (AWS Mantle)", api: "openai-completions", reasoning: true,
    input: ["text"], cost: { input: 0.22, output: 1.8, cacheRead: 0, cacheWrite: 0 }, contextWindow: 131_072, maxTokens: 65_536,
  },
  "qwen.qwen3-next-80b-a3b": {
    id: "qwen.qwen3-next-80b-a3b", name: "Qwen3 Next 80B A3B (AWS Mantle)", api: "openai-completions", reasoning: false,
    input: ["text"], cost: { input: 0.14, output: 1.4, cacheRead: 0, cacheWrite: 0 }, contextWindow: 262_000, maxTokens: 262_000,
  },
  "qwen.qwen3-vl-235b-a22b": {
    id: "qwen.qwen3-vl-235b-a22b", name: "Qwen3 VL 235B A22B (AWS Mantle)", api: "openai-completions", reasoning: false,
    input: ["text", "image"], cost: { input: 0.3, output: 1.5, cacheRead: 0, cacheWrite: 0 }, contextWindow: 262_000, maxTokens: 262_000,
  },
} as const satisfies Record<string, ProviderModelConfig>;

export const MANTLE_OPENAI_RESPONSES_MODELS = {
  "openai.gpt-5.4": {
    id: "openai.gpt-5.4", name: "GPT-5.4 (AWS Mantle)", api: "openai-responses", reasoning: true,
    input: ["text", "image"], cost: { input: 2.75, output: 16.5, cacheRead: 0.275, cacheWrite: 0 }, contextWindow: 272_000, maxTokens: 128_000,
  },
  "openai.gpt-5.5": {
    id: "openai.gpt-5.5", name: "GPT-5.5 (AWS Mantle)", api: "openai-responses", reasoning: true,
    input: ["text", "image"], cost: { input: 5.5, output: 33, cacheRead: 0.55, cacheWrite: 0 }, contextWindow: 272_000, maxTokens: 128_000,
  },
} as const satisfies Record<string, ProviderModelConfig>;

export interface SelectedMantleModels {
  readonly models: readonly ProviderModelConfig[];
  readonly unknownIds: readonly string[];
}


export function selectOpenAIResponsesModels(
  discovered: readonly { readonly id: string }[],
): readonly ProviderModelConfig[] {
  const selected: Record<string, ProviderModelConfig> = {};
  for (const { id } of discovered) {
    const model = MANTLE_OPENAI_RESPONSES_MODELS[id as keyof typeof MANTLE_OPENAI_RESPONSES_MODELS];
    if (model) selected[id] = model;
  }
  return Object.keys(selected).sort().map(id => selected[id] as ProviderModelConfig);
}

export function selectOpenAIModels(discovered: readonly { readonly id: string }[]): SelectedMantleModels {
  const selected: Record<string, ProviderModelConfig> = {};
  const unknown: Record<string, true> = {};
  for (const { id } of discovered) {
    const model = MANTLE_OPENAI_MODELS[id as keyof typeof MANTLE_OPENAI_MODELS];
    if (model) selected[id] = model;
    else unknown[id] = true;
  }
  return {
    models: Object.keys(selected).sort().map(id => selected[id] as ProviderModelConfig),
    unknownIds: Object.keys(unknown).sort(),
  };
}
