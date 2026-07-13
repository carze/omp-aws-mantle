import { describe, expect, test } from "bun:test";
import { discoverMantleModels } from "../src/discover-models";

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe("discoverMantleModels", () => {
  test("lists models with bearer auth and deterministic ordering", async () => {
    let request: Request | undefined;
    const models = await discoverMantleModels({
      baseUrl: "https://bedrock-mantle.us-east-1.api.aws/v1/",
      apiKey: "secret-key",
      fetch: async (input, init) => {
        request = input instanceof Request && init === undefined ? input : new Request(input, init);
        return jsonResponse({
          object: "list",
          data: [
            { id: "z-model", object: "model", created: 2, owned_by: "aws" },
            { id: "a-model", object: "model", created: 1, owned_by: "aws" },
          ],
        });
      },
    });

    expect(request?.url).toBe("https://bedrock-mantle.us-east-1.api.aws/v1/models");
    expect(request?.method).toBe("GET");
    expect(request?.headers.get("authorization")).toBe("Bearer secret-key");
    expect(models).toEqual([
      { id: "a-model", object: "model", created: 1, ownedBy: "aws" },
      { id: "z-model", object: "model", created: 2, ownedBy: "aws" },
    ]);
  });

  test("accepts an empty model list", async () => {
    const models = await discoverMantleModels({
      baseUrl: "https://example.test/v1",
      apiKey: "key",
      fetch: async () => jsonResponse({ object: "list", data: [] }),
    });
    expect(models).toEqual([]);
  });

  test.each([
    [401, "authentication failed (HTTP 401)"],
    [403, "access denied (HTTP 403)"],
    [429, "rate limited (HTTP 429)"],
    [500, "service error (HTTP 500)"],
  ])("sanitizes HTTP %i", async (status, message) => {
    const operation = discoverMantleModels({
      baseUrl: "https://example.test/v1",
      apiKey: "never-print-this",
      fetch: async () => new Response("sensitive upstream body", { status }),
    });
    await expect(operation).rejects.toThrow(`AWS Mantle model discovery ${message}`);
    await operation.catch(error => {
      expect(String(error)).not.toContain("never-print-this");
      expect(String(error)).not.toContain("sensitive upstream body");
    });
  });

  test.each([
    [{}, "response must be an object with a data array"],
    [{ data: "wrong" }, "response must be an object with a data array"],
    [{ data: [null] }, "model at index 0 must be an object"],
    [{ data: [{}] }, "model at index 0 must have a non-empty string id"],
    [{ data: [{ id: " " }] }, "model at index 0 must have a non-empty string id"],
    [{ data: [{ id: "a", created: "now" }] }, 'model "a" has an invalid created value'],
    [{ data: [{ id: "a", owned_by: 1 }] }, 'model "a" has an invalid owned_by value'],
    [{ data: [{ id: "a" }, { id: "a" }] }, 'duplicate model id "a"'],
  ])("rejects malformed schemas", async (body, message) => {
    await expect(
      discoverMantleModels({
        baseUrl: "https://example.test/v1",
        apiKey: "key",
        fetch: async () => jsonResponse(body),
      }),
    ).rejects.toThrow(`Invalid AWS Mantle models response: ${message}`);
  });

  test("rejects malformed JSON and unexpected content types", async () => {
    await expect(
      discoverMantleModels({
        baseUrl: "https://example.test/v1",
        apiKey: "key",
        fetch: async () => new Response("not-json", { headers: { "content-type": "application/json" } }),
      }),
    ).rejects.toThrow("AWS Mantle model discovery returned malformed JSON");

    await expect(
      discoverMantleModels({
        baseUrl: "https://example.test/v1",
        apiKey: "key",
        fetch: async () => new Response("{}", { headers: { "content-type": "text/html" } }),
      }),
    ).rejects.toThrow("AWS Mantle model discovery returned non-JSON content");
  });

  test("requires a non-empty key before making a request", async () => {
    let called = false;
    await expect(
      discoverMantleModels({
        baseUrl: "https://example.test/v1",
        apiKey: " ",
        fetch: async () => {
          called = true;
          return jsonResponse({ data: [] });
        },
      }),
    ).rejects.toThrow("AWS Mantle model discovery requires a Bedrock API key");
    expect(called).toBe(false);
  });

  test("turns aborts into a stable sanitized error", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      discoverMantleModels({
        baseUrl: "https://example.test/v1",
        apiKey: "secret-key",
        signal: controller.signal,
      }),
    ).rejects.toThrow("AWS Mantle model discovery was cancelled or timed out");
  });
});
