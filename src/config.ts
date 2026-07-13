export const MANTLE_REGIONS = [
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
  "us-west-2",
] as const;

export type MantleRegion = (typeof MANTLE_REGIONS)[number];

export interface MantleEnvironment {
  AWS_MANTLE_REGION?: string | undefined;
  AWS_REGION?: string | undefined;
  AWS_DEFAULT_REGION?: string | undefined;
  AWS_BEARER_TOKEN_BEDROCK?: string | undefined;
}

export interface MantleConfig {
  region: MantleRegion;
  apiKeyConfig: "AWS_BEARER_TOKEN_BEDROCK";
  compatBaseUrl: string;
  openAIBaseUrl: string;
  anthropicBaseUrl: string;
}


export function resolveMantleConfig(environment?: MantleEnvironment): MantleConfig {
  const source = environment ?? {
    AWS_MANTLE_REGION: process.env.AWS_MANTLE_REGION,
    AWS_REGION: process.env.AWS_REGION,
    AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
  };
  const requestedRegion =
    source.AWS_MANTLE_REGION?.trim() ||
    source.AWS_REGION?.trim() ||
    source.AWS_DEFAULT_REGION?.trim();

  if (!requestedRegion) {
    throw new Error("AWS Mantle requires AWS_MANTLE_REGION, AWS_REGION, or AWS_DEFAULT_REGION");
  }
  if (!(MANTLE_REGIONS as readonly string[]).includes(requestedRegion)) {
    throw new Error(`Unsupported AWS Mantle region ${JSON.stringify(requestedRegion)}`);
  }

  const region = requestedRegion as MantleRegion;
  const host = `https://bedrock-mantle.${region}.api.aws`;
  return {
    region,
    apiKeyConfig: "AWS_BEARER_TOKEN_BEDROCK",
    compatBaseUrl: `${host}/v1`,
    openAIBaseUrl: `${host}/openai/v1`,
    anthropicBaseUrl: `${host}/anthropic/v1`,
  };
}
