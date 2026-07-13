import type { ExtensionAPI, ExtensionFactory, ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";
import { isKnownAnthropicModelId, selectAnthropicModels } from "./anthropic-catalog";
import { type MantleEnvironment, resolveMantleConfig } from "./config";
import { discoverMantleModels } from "./discover-models";
import {
  MANTLE_OPENAI_RESPONSES_MODELS,
  selectOpenAIModels,
  selectOpenAIResponsesModels,
} from "./model-catalog";
import type { MantleFetch } from "./types";

export interface AwsMantleExtensionOptions {
  readonly environment?: MantleEnvironment;
  readonly fetch?: MantleFetch;
  readonly warn?: (message: string) => void;
}

export function createAwsMantleExtension(options: AwsMantleExtensionOptions = {}): ExtensionFactory {
  return (pi: ExtensionAPI): void => {
    const config = resolveMantleConfig(options.environment);
    const warn = options.warn ?? ((message: string) => pi.logger.warn(message));
    let cachedKey: string | undefined;
    let cachedModels: Promise<{
      openAI: readonly ProviderModelConfig[];
      openAIResponses: readonly ProviderModelConfig[];
      anthropic: readonly ProviderModelConfig[];
    }> | undefined;

    const loadModels = (apiKey: string | undefined) => {
      const resolvedKey = apiKey ?? "";
      if (cachedModels && cachedKey === resolvedKey) return cachedModels;
      cachedKey = resolvedKey;
      const pending = discoverMantleModels({
        baseUrl: config.compatBaseUrl,
        apiKey: resolvedKey,
        ...(options.fetch ? { fetch: options.fetch } : {}),
      }).then(discovered => {
        const openAI = selectOpenAIModels(discovered);
        const unknownIds = openAI.unknownIds.filter(
          id => !isKnownAnthropicModelId(id) && !Object.hasOwn(MANTLE_OPENAI_RESPONSES_MODELS, id),
        );
        if (unknownIds.length > 0) {
          warn(
            `AWS Mantle omitted models without verified metadata: ${unknownIds.join(", ")}`,
          );
        }
        return {
          openAI: openAI.models,
          openAIResponses: selectOpenAIResponsesModels(discovered),
          anthropic: selectAnthropicModels(discovered),
        };
      });
      let guarded: typeof pending;
      guarded = pending.catch(error => {
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
      fetchDynamicModels: async apiKey => (await loadModels(apiKey)).openAI,
    });
    pi.registerProvider("aws-mantle-openai", {
      baseUrl: config.openAIBaseUrl,
      apiKey: config.apiKeyConfig,
      fetchDynamicModels: async apiKey => (await loadModels(apiKey)).openAIResponses,
    });
    pi.registerProvider("aws-mantle-anthropic", {
      baseUrl: config.anthropicBaseUrl,
      apiKey: config.apiKeyConfig,
      fetchDynamicModels: async apiKey => (await loadModels(apiKey)).anthropic,
    });
  };
}

const awsMantleExtension = createAwsMantleExtension();
export default awsMantleExtension;
