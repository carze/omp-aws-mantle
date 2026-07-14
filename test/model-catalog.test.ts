import { describe, expect, test } from "bun:test";
import {
  MANTLE_OPENAI_MODELS,
  MANTLE_OPENAI_RESPONSES_MODELS,
  selectOpenAIModels,
  selectOpenAIResponsesModels,
} from "../src/model-catalog";

describe("Mantle OpenAI model catalog", () => {
  test("uses Responses only for live-verified Responses models", () => {
    expect(MANTLE_OPENAI_MODELS["openai.gpt-oss-120b"]?.api).toBe("openai-responses");
    expect(MANTLE_OPENAI_MODELS["openai.gpt-oss-20b"]?.api).toBe("openai-responses");
    expect(MANTLE_OPENAI_MODELS["openai.gpt-oss-120b"]).toEqual(
      expect.objectContaining({
        contextWindow: 128_000,
        maxTokens: 16_384,
        reasoning: true,
        input: ["text"],
      }),
    );
  });

  test("partitions GPT models onto the dedicated OpenAI Responses endpoint", () => {
    const result = selectOpenAIResponsesModels([
      { id: "openai.gpt-5.6-terra" },
      { id: "openai.gpt-5.5" },
      { id: "openai.gpt-5.6-luna" },
      { id: "openai.gpt-5.4" },
      { id: "openai.gpt-5.6-sol" },
      { id: "openai.gpt-5.5" },
      { id: "openai.gpt-oss-20b" },
    ]);

    expect(result.map(model => [model.id, model.api])).toEqual([
      ["openai.gpt-5.4", "openai-responses"],
      ["openai.gpt-5.5", "openai-responses"],
      ["openai.gpt-5.6-luna", "openai-responses"],
      ["openai.gpt-5.6-sol", "openai-responses"],
      ["openai.gpt-5.6-terra", "openai-responses"],
    ]);
    expect(MANTLE_OPENAI_RESPONSES_MODELS["openai.gpt-5.6-luna"]).toEqual(
      expect.objectContaining({
        input: ["text", "image"],
        cost: { input: 1.1, output: 6.6, cacheRead: 0.11, cacheWrite: 1.38 },
        contextWindow: 272_000,
        maxTokens: 128_000,
      }),
    );
    expect(MANTLE_OPENAI_RESPONSES_MODELS["openai.gpt-5.6-sol"]?.cost).toEqual({
      input: 5.5,
      output: 33,
      cacheRead: 0.55,
      cacheWrite: 6.88,
    });
    expect(MANTLE_OPENAI_RESPONSES_MODELS["openai.gpt-5.6-terra"]?.cost).toEqual({
      input: 2.75,
      output: 16.5,
      cacheRead: 0.28,
      cacheWrite: 3.44,
    });
  });

  test("routes Chat-only coding models through Chat Completions", () => {
    expect(MANTLE_OPENAI_MODELS["qwen.qwen3-coder-480b-a35b-instruct"]?.api).toBe("openai-completions");
    expect(MANTLE_OPENAI_MODELS["mistral.devstral-2-123b"]?.api).toBe("openai-completions");
    expect(MANTLE_OPENAI_MODELS["moonshotai.kimi-k2.5"]?.api).toBe("openai-completions");
  });

  test("intersects availability, deduplicates, and sorts deterministically", () => {
    const result = selectOpenAIModels([
      { id: "qwen.qwen3-coder-next" },
      { id: "unknown-z" },
      { id: "openai.gpt-oss-20b" },
      { id: "qwen.qwen3-coder-next" },
      { id: "unknown-a" },
    ]);

    expect(result.models.map(model => model.id)).toEqual([
      "openai.gpt-oss-20b",
      "qwen.qwen3-coder-next",
    ]);
    expect(result.unknownIds).toEqual(["unknown-a", "unknown-z"]);
  });

  test("every entry has safe complete metadata", () => {
    const entries = Object.entries({
      ...MANTLE_OPENAI_MODELS,
      ...MANTLE_OPENAI_RESPONSES_MODELS,
    });
    expect(entries.length).toBeGreaterThanOrEqual(30);
    for (const [id, model] of entries) {
      expect(String(model.id)).toBe(id);
      expect(model.name.length).toBeGreaterThan(0);
      expect(model.contextWindow).toBeGreaterThan(0);
      expect(model.maxTokens).toBeGreaterThan(0);
      expect(model.maxTokens).toBeLessThanOrEqual(model.contextWindow);
      expect(model.api === "openai-responses" || model.api === "openai-completions").toBe(true);
      expect(model.input.length).toBeGreaterThan(0);
      expect(model.cost.input).toBeGreaterThanOrEqual(0);
      expect(model.cost.output).toBeGreaterThanOrEqual(0);
    }
  });
});
