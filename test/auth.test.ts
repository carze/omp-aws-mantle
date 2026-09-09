import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createMantleAuthenticatedFetch } from "../src/auth";

const AWS_ENV_KEYS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_BEARER_TOKEN_BEDROCK",
  "AWS_PROFILE",
  "AWS_CONFIG_FILE",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "AWS_ROLE_ARN",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_EC2_METADATA_SERVICE_ENDPOINT",
  "AWS_EC2_METADATA_DISABLED",
  "AWS_SDK_LOAD_CONFIG",
] as const;

const originalEnvironment = Object.fromEntries(AWS_ENV_KEYS.map(key => [key, process.env[key]]));

function restoreAwsEnvironment(): void {
  for (const key of AWS_ENV_KEYS) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("Mantle authentication", () => {
  beforeEach(() => {
    for (const key of AWS_ENV_KEYS) delete process.env[key];
    process.env.AWS_EC2_METADATA_DISABLED = "true";
  });

  afterEach(restoreAwsEnvironment);

  test("preserves explicit bearer authentication", async () => {
    let request: Request | undefined;
    const authenticatedFetch = createMantleAuthenticatedFetch({
      region: "us-east-1",
      bearerToken: "bedrock-test-token",
      fetch: async (input, init) => {
        request = input instanceof Request && init === undefined ? input : new Request(input, init);
        return Response.json({ data: [] });
      },
    });

    await authenticatedFetch("https://bedrock-mantle.us-east-1.api.aws/v1/models");

    expect(request?.headers.get("authorization")).toBe("Bearer bedrock-test-token");
    expect(request?.headers.get("x-amz-date")).toBeNull();
  });

  test("signs requests and refreshes credentials after an authorization rejection", async () => {
    process.env.AWS_ACCESS_KEY_ID = "AKIDFIRST";
    process.env.AWS_SECRET_ACCESS_KEY = "first-secret";
    process.env.AWS_SESSION_TOKEN = "first-session";
    const requests: Request[] = [];
    const profile = `mantle-refresh-${crypto.randomUUID()}`;
    const authenticatedFetch = createMantleAuthenticatedFetch({
      region: "us-east-1",
      profile,
      fetch: async (input, init) => {
        requests.push(input instanceof Request && init === undefined ? input : new Request(input, init));
        return new Response(null, { status: requests.length === 1 ? 403 : 200 });
      },
    });

    expect((await authenticatedFetch("https://bedrock-mantle.us-east-1.api.aws/v1/models")).status).toBe(403);
    process.env.AWS_ACCESS_KEY_ID = "AKIDSECOND";
    process.env.AWS_SECRET_ACCESS_KEY = "second-secret";
    process.env.AWS_SESSION_TOKEN = "second-session";
    expect((await authenticatedFetch("https://bedrock-mantle.us-east-1.api.aws/v1/models")).status).toBe(200);

    expect(requests[0]?.headers.get("authorization")).toMatch(
      /Credential=AKIDFIRST\/\d{8}\/us-east-1\/bedrock-mantle\/aws4_request/,
    );
    expect(requests[0]?.headers.get("x-amz-security-token")).toBe("first-session");
    expect(requests[1]?.headers.get("authorization")).toMatch(
      /Credential=AKIDSECOND\/\d{8}\/us-east-1\/bedrock-mantle\/aws4_request/,
    );
    expect(requests[1]?.headers.get("x-amz-security-token")).toBe("second-session");
  });

  test("reports the exact SSO login command when the cached token is missing", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-mantle-sso-"));
    const profile = "mantle-sso-'$()-test";
    const configPath = path.join(tempDir, "config");
    fs.writeFileSync(configPath, [
      `[profile ${profile}]`,
      "sso_start_url = https://example.invalid/omp-mantle-sso",
      "sso_region = us-east-1",
      "sso_account_id = 123456789012",
      "sso_role_name = Developer",
      "region = us-east-1",
      "",
    ].join("\n"));
    process.env.AWS_CONFIG_FILE = configPath;
    process.env.AWS_SHARED_CREDENTIALS_FILE = path.join(tempDir, "credentials");

    try {
      const authenticatedFetch = createMantleAuthenticatedFetch({
        region: "us-east-1",
        profile,
        fetch: async () => {
          throw new Error("SSO failure should occur before the request");
        },
      });
      await expect(
        authenticatedFetch("https://bedrock-mantle.us-east-1.api.aws/v1/models"),
      ).rejects.toThrow(String.raw`Run: aws sso login --profile 'mantle-sso-'"'"'$()-test'`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
