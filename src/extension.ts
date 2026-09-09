import { streamAnthropic } from "@oh-my-pi/pi-ai/providers/anthropic";
import { streamOpenAICompletions } from "@oh-my-pi/pi-ai/providers/openai-completions";
import { streamOpenAIResponses } from "@oh-my-pi/pi-ai/providers/openai-responses";
import { NO_AUTH_SENTINEL } from "@oh-my-pi/pi-ai/providers/openai-shared";
import { resolveAwsRegistryApiKey } from "@oh-my-pi/pi-ai/registry/aws";
import { AUTHENTICATED_SENTINEL } from "@oh-my-pi/pi-ai/registry";
import type { Api, Context, Model, ModelSpec, SimpleStreamOptions } from "@oh-my-pi/pi-ai/types";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import type { ExtensionAPI, ExtensionFactory, ProviderModelConfig } from "@oh-my-pi/pi-coding-agent";
import { isKnownAnthropicModelId, selectAnthropicModels } from "./anthropic-catalog";
import { createMantleAuthenticatedFetch, resolveMantleBearerToken } from "./auth";
import { type MantleConfig, type MantleEnvironment, resolveMantleConfig } from "./config";
import { discoverMantleModels } from "./discover-models";
import {
  MANTLE_OPENAI_MODELS,
  MANTLE_OPENAI_RESPONSES_MODELS,
  selectOpenAIModels,
  selectOpenAIResponsesModels,
} from "./model-catalog";
import type { MantleFetch } from "./types";

const MANTLE_COMPAT_API = "aws-mantle-openai-compatible";
const MANTLE_RESPONSES_API = "aws-mantle-openai-responses";
const MANTLE_ANTHROPIC_API = "aws-mantle-anthropic-messages";

export interface AwsMantleExtensionOptions {
  readonly environment?: MantleEnvironment;
  readonly fetch?: MantleFetch;
  readonly warn?: (message: string) => void;
}

function routeModels(
  models: readonly ProviderModelConfig[],
  api: Api,
): readonly ProviderModelConfig[] {
  return models.map(model => ({ ...model, api }));
}

function createTransportModelResolver(resolveApi: (model: Model<Api>) => Api) {
  const cache = new WeakMap<Model<Api>, Model<Api>>();
  return (model: Model<Api>): Model<Api> => {
    const cached = cache.get(model);
    if (cached) return cached;

    const { compat: _resolvedCompat, compatConfig, ...spec } = model;
    const api = resolveApi(model);
    const transportModel = buildModel({
      ...spec,
      api,
      ...(compatConfig === undefined ? {} : { compat: compatConfig }),
    } as ModelSpec<Api>);
    cache.set(model, transportModel);
    return transportModel;
  };
}

function createAuthenticatedStream(
  config: MantleConfig,
  extensionOptions: AwsMantleExtensionOptions,
  resolveApi: (model: Model<Api>) => Api,
  includeAnthropicApiKey: boolean,
) {
  const resolveTransportModel = createTransportModelResolver(resolveApi);
  return (model: Model<Api>, context: Context, streamOptions: SimpleStreamOptions = {}) => {
    const explicitToken = typeof streamOptions.apiKey === "string" ? streamOptions.apiKey : undefined;
    const bearerToken = resolveMantleBearerToken(explicitToken, extensionOptions.environment ?? process.env);
    const authenticatedFetch = createMantleAuthenticatedFetch({
      region: config.region,
      ...(config.profile ? { profile: config.profile } : {}),
      ...(bearerToken ? { bearerToken } : {}),
      ...(streamOptions.fetch ?? extensionOptions.fetch
        ? { fetch: streamOptions.fetch ?? extensionOptions.fetch }
        : {}),
      ...(streamOptions.signal ? { signal: streamOptions.signal } : {}),
    });
    const transportModel = resolveTransportModel(model);
    const options = {
      ...streamOptions,
      apiKey: bearerToken ?? NO_AUTH_SENTINEL,
      fetch: authenticatedFetch,
      ...(includeAnthropicApiKey && bearerToken
        ? { headers: { ...streamOptions.headers, "X-Api-Key": bearerToken } }
        : {}),
    };

    if (transportModel.api === "openai-responses") {
      return streamOpenAIResponses(transportModel as Model<"openai-responses">, context, options);
    }
    if (transportModel.api === "openai-completions") {
      return streamOpenAICompletions(transportModel as Model<"openai-completions">, context, options);
    }
    if (transportModel.api === "anthropic-messages") {
      return streamAnthropic(transportModel as Model<"anthropic-messages">, context, options);
    }
    throw new Error(`Unsupported AWS Mantle transport ${JSON.stringify(transportModel.api)}`);
  };
}

export function createAwsMantleExtension(options: AwsMantleExtensionOptions = {}): ExtensionFactory {
  return (pi: ExtensionAPI): void => {
    const config = resolveMantleConfig(options.environment);
    const warn = options.warn ?? ((message: string) => pi.logger.warn(message));
    const hasInjectedAuthentication = Boolean(
      config.profile || options.environment?.AWS_BEARER_TOKEN_BEDROCK?.trim(),
    );
    const registryApiKey =
      resolveAwsRegistryApiKey() || (hasInjectedAuthentication ? AUTHENTICATED_SENTINEL : undefined);
    let cachedBearerToken: string | undefined;
    let cachedModels: Promise<{
      openAI: readonly ProviderModelConfig[];
      openAIResponses: readonly ProviderModelConfig[];
      anthropic: readonly ProviderModelConfig[];
    }> | undefined;

    const loadModels = (apiKey: string | undefined) => {
      const bearerToken = resolveMantleBearerToken(apiKey, options.environment ?? process.env);
      if (cachedModels && cachedBearerToken === bearerToken) return cachedModels;
      cachedBearerToken = bearerToken;
      const authenticatedFetch = createMantleAuthenticatedFetch({
        region: config.region,
        ...(config.profile ? { profile: config.profile } : {}),
        ...(bearerToken ? { bearerToken } : {}),
        ...(options.fetch ? { fetch: options.fetch } : {}),
      });
      const pending = discoverMantleModels({
        baseUrl: config.compatBaseUrl,
        fetch: authenticatedFetch,
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
          openAI: routeModels(openAI.models, MANTLE_COMPAT_API),
          openAIResponses: routeModels(selectOpenAIResponsesModels(discovered), MANTLE_RESPONSES_API),
          anthropic: routeModels(selectAnthropicModels(discovered), MANTLE_ANTHROPIC_API),
        };
      });
      let guarded: typeof pending;
      guarded = pending.catch(error => {
        if (cachedModels === guarded) {
          cachedModels = undefined;
          cachedBearerToken = undefined;
        }
        throw error;
      });
      cachedModels = guarded;
      return guarded;
    };

    pi.registerProvider("aws-mantle", {
      baseUrl: config.compatBaseUrl,
      ...(registryApiKey ? { apiKey: registryApiKey } : {}),
      api: MANTLE_COMPAT_API,
      streamSimple: createAuthenticatedStream(
        config,
        options,
        model => {
          const definition = MANTLE_OPENAI_MODELS[
            model.id as keyof typeof MANTLE_OPENAI_MODELS
          ];
          if (!definition) {
            throw new Error(`No AWS Mantle transport metadata for ${JSON.stringify(model.id)}`);
          }
          return definition.api;
        },
        false,
      ),
      fetchDynamicModels: async apiKey => (await loadModels(apiKey)).openAI,
    });
    pi.registerProvider("aws-mantle-openai", {
      baseUrl: config.openAIBaseUrl,
      ...(registryApiKey ? { apiKey: registryApiKey } : {}),
      api: MANTLE_RESPONSES_API,
      streamSimple: createAuthenticatedStream(config, options, () => "openai-responses", false),
      fetchDynamicModels: async apiKey => (await loadModels(apiKey)).openAIResponses,
    });
    pi.registerProvider("aws-mantle-anthropic", {
      baseUrl: config.anthropicBaseUrl,
      ...(registryApiKey ? { apiKey: registryApiKey } : {}),
      api: MANTLE_ANTHROPIC_API,
      streamSimple: createAuthenticatedStream(config, options, () => "anthropic-messages", true),
      fetchDynamicModels: async apiKey => (await loadModels(apiKey)).anthropic,
    });
  };
}

const awsMantleExtension = createAwsMantleExtension();
export default awsMantleExtension;
