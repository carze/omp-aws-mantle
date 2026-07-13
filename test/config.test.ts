import { describe, expect, test } from "bun:test";
import { MANTLE_REGIONS, resolveMantleConfig } from "../src/config";

describe("resolveMantleConfig", () => {
  test("uses the explicit Mantle region before AWS defaults", () => {
    const config = resolveMantleConfig({
      AWS_MANTLE_REGION: "eu-west-1",
      AWS_REGION: "us-east-2",
      AWS_DEFAULT_REGION: "us-west-2",
    });

    expect(config).toEqual({
      region: "eu-west-1",
      apiKeyConfig: "AWS_BEARER_TOKEN_BEDROCK",
      compatBaseUrl: "https://bedrock-mantle.eu-west-1.api.aws/v1",
      openAIBaseUrl: "https://bedrock-mantle.eu-west-1.api.aws/openai/v1",
      anthropicBaseUrl: "https://bedrock-mantle.eu-west-1.api.aws/anthropic/v1",
    });
  });

  test("falls back through standard AWS region variables", () => {
    expect(resolveMantleConfig({ AWS_REGION: "us-east-2" }).region).toBe("us-east-2");
    expect(resolveMantleConfig({ AWS_DEFAULT_REGION: "us-west-2" }).region).toBe("us-west-2");
  });

  test("rejects a missing region", () => {
    expect(() => resolveMantleConfig({})).toThrow(
      "AWS Mantle requires AWS_MANTLE_REGION, AWS_REGION, or AWS_DEFAULT_REGION",
    );
  });

  test("rejects unsupported regions without reflecting credentials", () => {
    expect(() =>
      resolveMantleConfig({
        AWS_MANTLE_REGION: "not-a-region",
        AWS_BEARER_TOKEN_BEDROCK: "secret-value",
      }),
    ).toThrow(`Unsupported AWS Mantle region "not-a-region"`);

    try {
      resolveMantleConfig({ AWS_MANTLE_REGION: "invalid", AWS_BEARER_TOKEN_BEDROCK: "secret-value" });
    } catch (error) {
      expect(String(error)).not.toContain("secret-value");
    }
  });

  test("contains every region documented by AWS", () => {
    expect(MANTLE_REGIONS).toEqual([
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
    ]);
  });
});
