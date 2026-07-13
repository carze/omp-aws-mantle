import type { DiscoverMantleModelsOptions, MantleModelRecord } from "./types";

function invalidResponse(detail: string): Error {
  return new Error(`Invalid AWS Mantle models response: ${detail}`);
}

function statusError(status: number): Error {
  if (status === 401) return new Error("AWS Mantle model discovery authentication failed (HTTP 401)");
  if (status === 403) return new Error("AWS Mantle model discovery access denied (HTTP 403)");
  if (status === 429) return new Error("AWS Mantle model discovery rate limited (HTTP 429)");
  return new Error(`AWS Mantle model discovery service error (HTTP ${status})`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseModel(value: unknown, index: number): MantleModelRecord {
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
  if (value.created !== undefined && (!Number.isSafeInteger(value.created) || (value.created as number) < 0)) {
    throw invalidResponse(`model ${JSON.stringify(id)} has an invalid created value`);
  }
  if (value.owned_by !== undefined && typeof value.owned_by !== "string") {
    throw invalidResponse(`model ${JSON.stringify(id)} has an invalid owned_by value`);
  }

  return {
    id,
    ...(typeof value.object === "string" ? { object: value.object } : {}),
    ...(typeof value.created === "number" ? { created: value.created } : {}),
    ...(typeof value.owned_by === "string" ? { ownedBy: value.owned_by } : {}),
  };
}

function parseModelsResponse(value: unknown): readonly MantleModelRecord[] {
  if (!isObject(value) || !Array.isArray(value.data)) {
    throw invalidResponse("response must be an object with a data array");
  }

  const models = value.data.map(parseModel);
  const byId: Record<string, true> = {};
  for (const model of models) {
    if (byId[model.id]) {
      throw invalidResponse(`duplicate model id ${JSON.stringify(model.id)}`);
    }
    byId[model.id] = true;
  }
  models.sort((left, right) => left.id.localeCompare(right.id));
  return models;
}

export async function discoverMantleModels(
  options: DiscoverMantleModelsOptions,
): Promise<readonly MantleModelRecord[]> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error("AWS Mantle model discovery requires a Bedrock API key");
  }

  const request = new Request(`${options.baseUrl.replace(/\/+$/, "")}/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    ...(options.signal ? { signal: options.signal } : {}),
  });

  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(request);
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new Error("AWS Mantle model discovery was cancelled or timed out");
    }
    throw new Error("AWS Mantle model discovery request failed");
  }

  if (!response.ok) throw statusError(response.status);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("AWS Mantle model discovery returned non-JSON content");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("AWS Mantle model discovery returned malformed JSON");
  }
  return parseModelsResponse(payload);
}
