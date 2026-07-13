import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ProviderConfig } from "@oh-my-pi/pi-coding-agent";
import { ModelRegistry, type ProviderConfigInput } from "@oh-my-pi/pi-coding-agent/config/model-registry";
import { AuthStorage } from "@oh-my-pi/pi-coding-agent/session/auth-storage";
import { createAwsMantleExtension } from "../src/extension";

interface Registration {
  name: string;
  config: ProviderConfigInput;
}

function registrationHarness(): { pi: ExtensionAPI; registrations: Registration[] } {
  const registrations: Registration[] = [];
  const pi = {
    registerProvider(name: string, config: ProviderConfig) {
      registrations.push({ name, config: config as ProviderConfigInput });
    },
  } as ExtensionAPI;
  return { pi, registrations };
}

describe("AWS Mantle host lifecycle", () => {
  let tempDir: string;
  let authStorage: AuthStorage;
  let registry: ModelRegistry;
  const originalApiKey = process.env.AWS_BEARER_TOKEN_BEDROCK;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-aws-mantle-host-"));
    process.env.AWS_BEARER_TOKEN_BEDROCK = "host-cache-test-key";
    authStorage = await AuthStorage.create(path.join(tempDir, "auth.db"));
    registry = new ModelRegistry(authStorage, path.join(tempDir, "models.json"));
  });

  afterEach(() => {
    authStorage.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalApiKey === undefined) delete process.env.AWS_BEARER_TOKEN_BEDROCK;
    else process.env.AWS_BEARER_TOKEN_BEDROCK = originalApiKey;
  });

  test("uses the host 24-hour cache and removes models with their extension source", async () => {
    let discoveryRequests = 0;
    const { pi, registrations } = registrationHarness();
    await createAwsMantleExtension({
      environment: { AWS_MANTLE_REGION: "us-east-1" },
      fetch: async () => {
        discoveryRequests += 1;
        return Response.json({
          data: [
            { id: "openai.gpt-oss-20b" },
            { id: "openai.gpt-5.5" },
            { id: "anthropic.claude-sonnet-5" },
          ],
        });
      },
      warn: () => {},
    })(pi);

    for (const registration of registrations) {
      registry.registerProvider(registration.name, registration.config, "extension://aws-mantle-v1");
    }

    await registry.refreshRuntimeProviders("online-if-uncached");
    expect(registry.find("aws-mantle", "openai.gpt-oss-20b")).toBeDefined();
    expect(registry.find("aws-mantle-openai", "openai.gpt-5.5")).toBeDefined();
    expect(registry.find("aws-mantle-anthropic", "anthropic.claude-sonnet-5")).toBeDefined();
    expect(discoveryRequests).toBe(1);

    await registry.refreshRuntimeProviders("online-if-uncached");
    expect(discoveryRequests).toBe(1);

    registry.clearSourceRegistrations("extension://aws-mantle-v1");
    expect(registry.find("aws-mantle", "openai.gpt-oss-20b")).toBeUndefined();
    expect(registry.find("aws-mantle-openai", "openai.gpt-5.5")).toBeUndefined();
    expect(registry.find("aws-mantle-anthropic", "anthropic.claude-sonnet-5")).toBeUndefined();
  });

  test("a source replacement owns fresh discovery state", async () => {
    const first = registrationHarness();
    await createAwsMantleExtension({
      environment: { AWS_MANTLE_REGION: "us-east-1" },
      fetch: async () => Response.json({ data: [{ id: "openai.gpt-oss-20b" }] }),
      warn: () => {},
    })(first.pi);
    for (const registration of first.registrations) {
      registry.registerProvider(registration.name, registration.config, "extension://aws-mantle-v1");
    }
    await registry.refreshRuntimeProviders("online");
    expect(registry.find("aws-mantle", "openai.gpt-oss-20b")).toBeDefined();

    registry.clearSourceRegistrations("extension://aws-mantle-v1");

    let replacementRequests = 0;
    const replacement = registrationHarness();
    await createAwsMantleExtension({
      environment: { AWS_MANTLE_REGION: "us-east-1" },
      fetch: async () => {
        replacementRequests += 1;
        return Response.json({ data: [{ id: "openai.gpt-oss-120b" }] });
      },
      warn: () => {},
    })(replacement.pi);
    for (const registration of replacement.registrations) {
      registry.registerProvider(registration.name, registration.config, "extension://aws-mantle-v2");
    }
    await registry.refreshRuntimeProviders("online");

    expect(replacementRequests).toBe(1);
    expect(registry.find("aws-mantle", "openai.gpt-oss-20b")).toBeUndefined();
    expect(registry.find("aws-mantle", "openai.gpt-oss-120b")).toBeDefined();
  });
});
