import { AwsCredentialsError } from "@oh-my-pi/pi-ai/error";
import { createBedrockMantleAuthenticatedFetch } from "@oh-my-pi/pi-ai/providers/bedrock-mantle";
import { resolveAwsBearerToken } from "@oh-my-pi/pi-ai/registry/aws";
import type { MantleFetch } from "./types";

export interface MantleAuthenticationOptions {
  readonly region: string;
  readonly profile?: string;
  readonly bearerToken?: string;
  readonly fetch?: MantleFetch;
  readonly signal?: AbortSignal;
}

export function resolveMantleBearerToken(
  explicitToken?: string,
  environment: { readonly AWS_BEARER_TOKEN_BEDROCK?: string | undefined } | NodeJS.ProcessEnv = process.env,
): string | undefined {
  return resolveAwsBearerToken(explicitToken?.trim(), environment.AWS_BEARER_TOKEN_BEDROCK?.trim());
}

export function createMantleAuthenticatedFetch(options: MantleAuthenticationOptions): MantleFetch {
  const authenticatedFetch = createBedrockMantleAuthenticatedFetch({
    ...(options.bearerToken ? { apiKey: options.bearerToken } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    providerOptions: {
      region: options.region,
      ...(options.profile ? { profile: options.profile } : {}),
    },
  });

  return async (input, init) => {
    try {
      return await authenticatedFetch(input, init);
    } catch (error) {
      if (
        error instanceof AwsCredentialsError &&
        (error.kind === "sso-token-missing" || error.kind === "sso-token-expired")
      ) {
        const profile = options.profile?.trim() || process.env.AWS_PROFILE?.trim() || "default";
        const reason = error.kind === "sso-token-expired" ? "has expired" : "was not found";
        const shellQuotedProfile = `'${profile.replaceAll("'", "'\"'\"'")}'`;
        throw new AwsCredentialsError(
          `AWS SSO credentials for profile ${JSON.stringify(profile)} ${reason}. Run: aws sso login --profile ${shellQuotedProfile}`,
          error.kind,
          { cause: error },
        );
      }
      throw error;
    }
  };
}
