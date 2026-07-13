// @bun
// src/anthropic-catalog.ts
var ADAPTIVE_EFFORTS = ["low", "medium", "high", "max"];
var BUDGET_EFFORTS = ["minimal", "low", "medium", "high"];
var MANTLE_ANTHROPIC_MODELS = {
  "anthropic.claude-fable-5": {
    id: "anthropic.claude-fable-5",
    name: "Claude Fable 5 (AWS Mantle)",
    api: "anthropic-messages",
    headers: { "X-Api-Key": "AWS_BEARER_TOKEN_BEDROCK" },
    reasoning: true,
    thinking: { mode: "anthropic-adaptive", efforts: ADAPTIVE_EFFORTS, supportsDisplay: true },
    input: ["text", "image"],
    cost: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
    contextWindow: 1e6,
    maxTokens: 128000
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
    contextWindow: 200000,
    maxTokens: 64000
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
    contextWindow: 1e6,
    maxTokens: 128000
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
    contextWindow: 1e6,
    maxTokens: 128000
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
    contextWindow: 1e6,
    maxTokens: 128000
  }
};
function isKnownAnthropicModelId(id) {
  return Object.hasOwn(MANTLE_ANTHROPIC_MODELS, id);
}
function selectAnthropicModels(discovered) {
  const selected = {};
  for (const { id } of discovered) {
    if (isKnownAnthropicModelId(id))
      selected[id] = MANTLE_ANTHROPIC_MODELS[id];
  }
  return Object.keys(selected).sort().map((id) => selected[id]);
}

// src/config.ts
var MANTLE_REGIONS = [
  "ap-northeast-1",
  "ap-south-1",
  "ap-southeast-2",
  "ap-southeast-3",
  "eu-central-1",
  "eu-north-1",
  "eu-south-1",
  "eu-west-1",
  "eu-west-2",
  "sa-east-1",
  "us-east-1",
  "us-east-2",
  "us-gov-west-1",
  "us-west-2"
];
function resolveMantleConfig(environment) {
  const source = environment ?? {
    AWS_MANTLE_REGION: process.env.AWS_MANTLE_REGION,
    AWS_REGION: process.env.AWS_REGION,
    AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION
  };
  const requestedRegion = source.AWS_MANTLE_REGION?.trim() || source.AWS_REGION?.trim() || source.AWS_DEFAULT_REGION?.trim();
  if (!requestedRegion) {
    throw new Error("AWS Mantle requires AWS_MANTLE_REGION, AWS_REGION, or AWS_DEFAULT_REGION");
  }
  if (!MANTLE_REGIONS.includes(requestedRegion)) {
    throw new Error(`Unsupported AWS Mantle region ${JSON.stringify(requestedRegion)}`);
  }
  const region = requestedRegion;
  const host = `https://bedrock-mantle.${region}.api.aws`;
  return {
    region,
    apiKeyConfig: "AWS_BEARER_TOKEN_BEDROCK",
    compatBaseUrl: `${host}/v1`,
    openAIBaseUrl: `${host}/openai/v1`,
    anthropicBaseUrl: `${host}/anthropic/v1`
  };
}

// src/discover-models.ts
function invalidResponse(detail) {
  return new Error(`Invalid AWS Mantle models response: ${detail}`);
}
function statusError(status) {
  if (status === 401)
    return new Error("AWS Mantle model discovery authentication failed (HTTP 401)");
  if (status === 403)
    return new Error("AWS Mantle model discovery access denied (HTTP 403)");
  if (status === 429)
    return new Error("AWS Mantle model discovery rate limited (HTTP 429)");
  return new Error(`AWS Mantle model discovery service error (HTTP ${status})`);
}
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseModel(value, index) {
  if (!isObject(value)) {
    throw invalidResponse(`model at index ${index} must be an object`);
  }
  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw invalidResponse(`model at index ${index} must have a non-empty string id`);
  }
  const id = value.id.trim();
  if (value.object !== undefined && typeof value.object !== "string") {
    throw invalidResponse(`model ${JSON.stringify(id)} has an invalid object value`);
  }
  if (value.created !== undefined && (!Number.isSafeInteger(value.created) || value.created < 0)) {
    throw invalidResponse(`model ${JSON.stringify(id)} has an invalid created value`);
  }
  if (value.owned_by !== undefined && typeof value.owned_by !== "string") {
    throw invalidResponse(`model ${JSON.stringify(id)} has an invalid owned_by value`);
  }
  return {
    id,
    ...typeof value.object === "string" ? { object: value.object } : {},
    ...typeof value.created === "number" ? { created: value.created } : {},
    ...typeof value.owned_by === "string" ? { ownedBy: value.owned_by } : {}
  };
}
function parseModelsResponse(value) {
  if (!isObject(value) || !Array.isArray(value.data)) {
    throw invalidResponse("response must be an object with a data array");
  }
  const models = value.data.map(parseModel);
  const byId = {};
  for (const model of models) {
    if (byId[model.id]) {
      throw invalidResponse(`duplicate model id ${JSON.stringify(model.id)}`);
    }
    byId[model.id] = true;
  }
  models.sort((left, right) => left.id.localeCompare(right.id));
  return models;
}
async function discoverMantleModels(options) {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error("AWS Mantle model discovery requires a Bedrock API key");
  }
  const request = new Request(`${options.baseUrl.replace(/\/+$/, "")}/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    ...options.signal ? { signal: options.signal } : {}
  });
  let response;
  try {
    response = await (options.fetch ?? fetch)(request);
  } catch (error) {
    if (options.signal?.aborted || error instanceof DOMException && error.name === "AbortError") {
      throw new Error("AWS Mantle model discovery was cancelled or timed out");
    }
    throw new Error("AWS Mantle model discovery request failed");
  }
  if (!response.ok)
    throw statusError(response.status);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("AWS Mantle model discovery returned non-JSON content");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("AWS Mantle model discovery returned malformed JSON");
  }
  return parseModelsResponse(payload);
}

// src/model-catalog.ts
var MANTLE_OPENAI_MODELS = {
  "deepseek.v3.1": {
    id: "deepseek.v3.1",
    name: "DeepSeek V3.1 (AWS Mantle)",
    api: "openai-completions",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.58, output: 1.68, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192
  },
  "deepseek.v3.2": {
    id: "deepseek.v3.2",
    name: "DeepSeek V3.2 (AWS Mantle)",
    api: "openai-completions",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.62, output: 1.85, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 163840,
    maxTokens: 81920
  },
  "google.gemma-3-27b-it": {
    id: "google.gemma-3-27b-it",
    name: "Gemma 3 27B Instruct (AWS Mantle)",
    api: "openai-completions",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.12, output: 0.2, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 202752,
    maxTokens: 8192
  },
  "google.gemma-3-4b-it": {
    id: "google.gemma-3-4b-it",
    name: "Gemma 3 4B Instruct (AWS Mantle)",
    api: "openai-completions",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.04, output: 0.08, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096
  },
  "minimax.minimax-m2": {
    id: "minimax.minimax-m2",
    name: "MiniMax M2 (AWS Mantle)",
    api: "openai-completions",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.3, output: 1.2, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204608,
    maxTokens: 128000
  },
  "minimax.minimax-m2.1": {
    id: "minimax.minimax-m2.1",
    name: "MiniMax M2.1 (AWS Mantle)",
    api: "openai-completions",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.3, output: 1.2, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 131072
  },
  "minimax.minimax-m2.5": {
    id: "minimax.minimax-m2.5",
    name: "MiniMax M2.5 (AWS Mantle)",
    api: "openai-completions",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.3, output: 1.2, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 196608,
    maxTokens: 98304
  },
  "mistral.devstral-2-123b": {
    id: "mistral.devstral-2-123b",
    name: "Devstral 2 123B (AWS Mantle)",
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.4, output: 2, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 256000,
    maxTokens: 8192
  },
  "mistral.magistral-small-2509": {
    id: "mistral.magistral-small-2509",
    name: "Magistral Small 2509 (AWS Mantle)",
    api: "openai-completions",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.5, output: 1.5, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 40000
  },
  "mistral.ministral-3-14b-instruct": {
    id: "mistral.ministral-3-14b-instruct",
    name: "Ministral 3 14B (AWS Mantle)",
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.2, output: 0.2, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096
  },
  "mistral.ministral-3-3b-instruct": {
    id: "mistral.ministral-3-3b-instruct",
    name: "Ministral 3 3B (AWS Mantle)",
    api: "openai-completions",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.1, output: 0.1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 256000,
    maxTokens: 8192
  },
  "mistral.ministral-3-8b-instruct": {
    id: "mistral.ministral-3-8b-instruct",
    name: "Ministral 3 8B (AWS Mantle)",
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.15, output: 0.15, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096
  },
  "mistral.mistral-large-3-675b-instruct": {
    id: "mistral.mistral-large-3-675b-instruct",
    name: "Mistral Large 3 (AWS Mantle)",
    api: "openai-completions",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.5, output: 1.5, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 256000,
    maxTokens: 8192
  },
  "moonshotai.kimi-k2.5": {
    id: "moonshotai.kimi-k2.5",
    name: "Kimi K2.5 (AWS Mantle)",
    api: "openai-completions",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 0.6, output: 3, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262143,
    maxTokens: 16000
  },
  "nvidia.nemotron-nano-12b-v2": {
    id: "nvidia.nemotron-nano-12b-v2",
    name: "Nemotron Nano 12B v2 VL (AWS Mantle)",
    api: "openai-completions",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.2, output: 0.6, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096
  },
  "nvidia.nemotron-nano-3-30b": {
    id: "nvidia.nemotron-nano-3-30b",
    name: "Nemotron Nano 3 30B (AWS Mantle)",
    api: "openai-completions",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.06, output: 0.24, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096
  },
  "nvidia.nemotron-nano-9b-v2": {
    id: "nvidia.nemotron-nano-9b-v2",
    name: "Nemotron Nano 9B v2 (AWS Mantle)",
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.06, output: 0.23, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096
  },
  "nvidia.nemotron-super-3-120b": {
    id: "nvidia.nemotron-super-3-120b",
    name: "Nemotron 3 Super 120B (AWS Mantle)",
    api: "openai-completions",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.15, output: 0.65, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 131072
  },
  "openai.gpt-oss-120b": {
    id: "openai.gpt-oss-120b",
    name: "GPT OSS 120B (AWS Mantle)",
    api: "openai-responses",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.15, output: 0.6, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384
  },
  "openai.gpt-oss-20b": {
    id: "openai.gpt-oss-20b",
    name: "GPT OSS 20B (AWS Mantle)",
    api: "openai-responses",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.07, output: 0.3, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384
  },
  "qwen.qwen3-235b-a22b-2507": {
    id: "qwen.qwen3-235b-a22b-2507",
    name: "Qwen3 235B A22B 2507 (AWS Mantle)",
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.22, output: 0.88, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 131072
  },
  "qwen.qwen3-32b": {
    id: "qwen.qwen3-32b",
    name: "Qwen3 32B (AWS Mantle)",
    api: "openai-completions",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.15, output: 0.6, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 16384,
    maxTokens: 16384
  },
  "qwen.qwen3-coder-30b-a3b-instruct": {
    id: "qwen.qwen3-coder-30b-a3b-instruct",
    name: "Qwen3 Coder 30B A3B (AWS Mantle)",
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.15, output: 0.6, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 131072
  },
  "qwen.qwen3-coder-480b-a35b-instruct": {
    id: "qwen.qwen3-coder-480b-a35b-instruct",
    name: "Qwen3 Coder 480B A35B (AWS Mantle)",
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.22, output: 1.8, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384
  },
  "qwen.qwen3-coder-next": {
    id: "qwen.qwen3-coder-next",
    name: "Qwen3 Coder Next (AWS Mantle)",
    api: "openai-completions",
    reasoning: true,
    input: ["text"],
    cost: { input: 0.22, output: 1.8, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 65536
  },
  "qwen.qwen3-next-80b-a3b": {
    id: "qwen.qwen3-next-80b-a3b",
    name: "Qwen3 Next 80B A3B (AWS Mantle)",
    api: "openai-completions",
    reasoning: false,
    input: ["text"],
    cost: { input: 0.14, output: 1.4, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262000,
    maxTokens: 262000
  },
  "qwen.qwen3-vl-235b-a22b": {
    id: "qwen.qwen3-vl-235b-a22b",
    name: "Qwen3 VL 235B A22B (AWS Mantle)",
    api: "openai-completions",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.3, output: 1.5, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262000,
    maxTokens: 262000
  }
};
var MANTLE_OPENAI_RESPONSES_MODELS = {
  "openai.gpt-5.4": {
    id: "openai.gpt-5.4",
    name: "GPT-5.4 (AWS Mantle)",
    api: "openai-responses",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 2.75, output: 16.5, cacheRead: 0.275, cacheWrite: 0 },
    contextWindow: 272000,
    maxTokens: 128000
  },
  "openai.gpt-5.5": {
    id: "openai.gpt-5.5",
    name: "GPT-5.5 (AWS Mantle)",
    api: "openai-responses",
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 5.5, output: 33, cacheRead: 0.55, cacheWrite: 0 },
    contextWindow: 272000,
    maxTokens: 128000
  }
};
function selectOpenAIResponsesModels(discovered) {
  const selected = {};
  for (const { id } of discovered) {
    const model = MANTLE_OPENAI_RESPONSES_MODELS[id];
    if (model)
      selected[id] = model;
  }
  return Object.keys(selected).sort().map((id) => selected[id]);
}
function selectOpenAIModels(discovered) {
  const selected = {};
  const unknown = {};
  for (const { id } of discovered) {
    const model = MANTLE_OPENAI_MODELS[id];
    if (model)
      selected[id] = model;
    else
      unknown[id] = true;
  }
  return {
    models: Object.keys(selected).sort().map((id) => selected[id]),
    unknownIds: Object.keys(unknown).sort()
  };
}

// src/extension.ts
function createAwsMantleExtension(options = {}) {
  return (pi) => {
    const config = resolveMantleConfig(options.environment);
    const warn = options.warn ?? ((message) => pi.logger.warn(message));
    let cachedKey;
    let cachedModels;
    const loadModels = (apiKey) => {
      const resolvedKey = apiKey ?? "";
      if (cachedModels && cachedKey === resolvedKey)
        return cachedModels;
      cachedKey = resolvedKey;
      const pending = discoverMantleModels({
        baseUrl: config.compatBaseUrl,
        apiKey: resolvedKey,
        ...options.fetch ? { fetch: options.fetch } : {}
      }).then((discovered) => {
        const openAI = selectOpenAIModels(discovered);
        const unknownIds = openAI.unknownIds.filter((id) => !isKnownAnthropicModelId(id) && !Object.hasOwn(MANTLE_OPENAI_RESPONSES_MODELS, id));
        if (unknownIds.length > 0) {
          warn(`AWS Mantle omitted models without verified metadata: ${unknownIds.join(", ")}`);
        }
        return {
          openAI: openAI.models,
          openAIResponses: selectOpenAIResponsesModels(discovered),
          anthropic: selectAnthropicModels(discovered)
        };
      });
      let guarded;
      guarded = pending.catch((error) => {
        if (cachedModels === guarded) {
          cachedModels = undefined;
          cachedKey = undefined;
        }
        throw error;
      });
      cachedModels = guarded;
      return guarded;
    };
    pi.registerProvider("aws-mantle", {
      baseUrl: config.compatBaseUrl,
      apiKey: config.apiKeyConfig,
      fetchDynamicModels: async (apiKey) => (await loadModels(apiKey)).openAI
    });
    pi.registerProvider("aws-mantle-openai", {
      baseUrl: config.openAIBaseUrl,
      apiKey: config.apiKeyConfig,
      fetchDynamicModels: async (apiKey) => (await loadModels(apiKey)).openAIResponses
    });
    pi.registerProvider("aws-mantle-anthropic", {
      baseUrl: config.anthropicBaseUrl,
      apiKey: config.apiKeyConfig,
      fetchDynamicModels: async (apiKey) => (await loadModels(apiKey)).anthropic
    });
  };
}
var awsMantleExtension = createAwsMantleExtension();
var extension_default = awsMantleExtension;
export {
  extension_default as default,
  createAwsMantleExtension
};
