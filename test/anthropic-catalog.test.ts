import { describe, expect, test } from "bun:test";
import { MANTLE_ANTHROPIC_MODELS, isKnownAnthropicModelId, selectAnthropicModels } from "../src/anthropic-catalog";

describe("Mantle Anthropic model catalog", () => {
  test("uses exact Mantle IDs and Messages API metadata", () => {
    expect(MANTLE_ANTHROPIC_MODELS["anthropic.claude-sonnet-5"]).toEqual(
      expect.objectContaining({
        api: "anthropic-messages",
        contextWindow: 1_000_000,
        maxTokens: 128_000,
        reasoning: true,
        input: ["text", "image"],
        thinking: expect.objectContaining({ mode: "anthropic-adaptive" }),
      }),
    );
    expect(MANTLE_ANTHROPIC_MODELS["anthropic.claude-haiku-4-5"]?.thinking).toEqual(
      expect.objectContaining({ mode: "budget" }),
    );
  });

  test("selects only accessible Claude models in deterministic order", () => {
    const selected = selectAnthropicModels([
      { id: "qwen.qwen3-coder-next" },
      { id: "anthropic.claude-sonnet-5" },
      { id: "anthropic.claude-opus-4-8" },
      { id: "anthropic.claude-sonnet-5" },
    ]);
    expect(selected.map(model => model.id)).toEqual([
      "anthropic.claude-opus-4-8",
      "anthropic.claude-sonnet-5",
    ]);
  });

  test("does not advertise structured-output compatibility", () => {
    for (const model of Object.values(MANTLE_ANTHROPIC_MODELS)) {
      expect(model.api).toBe("anthropic-messages");
      expect("compat" in model).toBe(false);
      expect(JSON.stringify(model)).not.toContain("structured");
    }
  });

  test("identifies known Claude IDs without accepting native inference profiles", () => {
    expect(isKnownAnthropicModelId("anthropic.claude-opus-4-7")).toBe(true);
    expect(isKnownAnthropicModelId("us.anthropic.claude-opus-4-7")).toBe(false);
    expect(isKnownAnthropicModelId("openai.gpt-oss-120b")).toBe(false);
  });
});
