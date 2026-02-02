/**
 * Unit tests for utility functions in utils.ts
 */

import {
  LanguageModelDataPart,
  LanguageModelTextPart,
  LanguageModelChatMessageRole,
} from "../__mocks__/vscode";
import * as vscode from "vscode";
import {
  tryParseJSONObject,
  validateRequest,
  estimateTokens,
  estimateMessagesTokens,
} from "../src/utils";

describe("tryParseJSONObject", () => {
  it("should parse valid JSON object successfully", () => {
    const result = tryParseJSONObject('{"name": "test", "value": 123}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ name: "test", value: 123 });
    }
  });

  it("should parse valid JSON array successfully", () => {
    const result = tryParseJSONObject("[1, 2, 3]");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([1, 2, 3]);
    }
  });

  it("should parse valid JSON string successfully", () => {
    const result = tryParseJSONObject('"hello world"');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("hello world");
    }
  });

  it("should parse valid JSON number successfully", () => {
    const result = tryParseJSONObject("42");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("should parse valid JSON boolean successfully", () => {
    const result = tryParseJSONObject("true");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(true);
    }
  });

  it("should return error for invalid JSON", () => {
    const result = tryParseJSONObject("{invalid json}");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
    }
  });

  it("should return error for empty string", () => {
    const result = tryParseJSONObject("");
    expect(result.ok).toBe(false);
  });

  it("should return error for non-JSON string", () => {
    const result = tryParseJSONObject("just a string");
    expect(result.ok).toBe(false);
  });

  it("should return error for malformed object", () => {
    const result = tryParseJSONObject('{name: "test"}'); // Missing quotes
    expect(result.ok).toBe(false);
  });
});

describe("validateRequest", () => {
  it("should pass validation for valid message array", () => {
    const message = new vscode.LanguageModelChatMessage(
      vscode.LanguageModelChatMessageRole.User,
      [new vscode.LanguageModelTextPart("Hello")]
    );
    expect(() => validateRequest([message])).not.toThrow();
  });

  it("should throw error for empty message array", () => {
    expect(() => validateRequest([])).toThrow("Messages array is empty");
  });

  it("should throw error for null messages", () => {
    expect(() => validateRequest(null as any)).toThrow(
      "Messages array is empty"
    );
  });

  it("should throw error for undefined messages", () => {
    expect(() => validateRequest(undefined as any)).toThrow(
      "Messages array is empty"
    );
  });

  it("should throw error for message with no content", () => {
    const message = new vscode.LanguageModelChatMessage(
      vscode.LanguageModelChatMessageRole.User,
      []
    );
    expect(() => validateRequest([message])).toThrow("Message has no content");
  });

  it("should pass validation for multiple messages", () => {
    const messages = [
      new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.User,
        [new vscode.LanguageModelTextPart("Hello")]
      ),
      new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.Assistant,
        [new vscode.LanguageModelTextPart("Hi there")]
      ),
    ];
    expect(() => validateRequest(messages)).not.toThrow();
  });
});

describe("estimateTokens", () => {
  it("should estimate tokens for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("should estimate tokens for short text", () => {
    const text = "Hello";
    expect(estimateTokens(text)).toBe(Math.ceil(5 / 4)); // 5 chars / 4 = 1.25 -> 2
  });

  it("should estimate tokens for longer text", () => {
    const text = "Hello world, this is a test";
    expect(estimateTokens(text)).toBe(Math.ceil(27 / 4)); // 27 chars / 4 = 6.75 -> 7
  });

  it("should handle whitespace", () => {
    const text = "Hello   world";
    expect(estimateTokens(text)).toBe(Math.ceil(13 / 4)); // 13 chars / 4 = 3.25 -> 4
  });

  it("should handle newlines", () => {
    const text = "Hello\nWorld\nTest";
    expect(estimateTokens(text)).toBe(Math.ceil(15 / 4)); // 15 chars / 4 = 3.75 -> 4
  });

  it("should handle unicode characters", () => {
    const text = "こんにちは世界";
    expect(estimateTokens(text)).toBe(Math.ceil(7 / 4)); // 7 chars / 4 = 1.75 -> 2
  });

  it("should handle special characters", () => {
    const text = "!@#$%^&*()";
    expect(estimateTokens(text)).toBe(Math.ceil(10 / 4)); // 10 chars / 4 = 2.5 -> 3
  });
});

describe("estimateMessagesTokens", () => {
  it("should estimate tokens for single text message", () => {
    const message = new vscode.LanguageModelChatMessage(
      vscode.LanguageModelChatMessageRole.User,
      [new vscode.LanguageModelTextPart("Hello world")]
    );
    const tokens = estimateMessagesTokens([message]);
    expect(tokens).toBe(Math.ceil(11 / 4)); // 11 chars / 4 = 2.75 -> 3
  });

  it("should estimate tokens for multiple messages", () => {
    const messages = [
      new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.User,
        [new vscode.LanguageModelTextPart("Hello")]
      ),
      new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.Assistant,
        [new vscode.LanguageModelTextPart("Hi there")]
      ),
    ];
    const tokens = estimateMessagesTokens(messages);
    expect(tokens).toBe(Math.ceil(14 / 4)); // 14 chars total / 4 = 3.5 -> 4
  });

  it("should estimate tokens for messages with images", () => {
    // Create a mock image part using LanguageModelDataPart.image()
    const mockImagePart = LanguageModelDataPart.image(
      new Uint8Array([1, 2, 3, 4]),
      "image/png"
    );

    const message = new vscode.LanguageModelChatMessage(
      vscode.LanguageModelChatMessageRole.User,
      [
        new vscode.LanguageModelTextPart("Describe this"),
        mockImagePart,
      ] as vscode.LanguageModelInputPart[]
    );
    const tokens = estimateMessagesTokens([message]);
    // 16 chars for text + 1500 for image = 1516
    expect(tokens).toBeGreaterThanOrEqual(1500);
  });

  it("should estimate tokens for message with only text", () => {
    const message = new vscode.LanguageModelChatMessage(
      vscode.LanguageModelChatMessageRole.User,
      [
        new vscode.LanguageModelTextPart("Part 1"),
        new vscode.LanguageModelTextPart("Part 2"),
        new vscode.LanguageModelTextPart("Part 3"),
      ]
    );
    const tokens = estimateMessagesTokens([message]);
    // Each part: 6 chars / 4 = 1.5 -> 2 tokens, Total: 2+2+2 = 6 tokens
    expect(tokens).toBe(6);
  });

  it("should handle empty messages array", () => {
    const tokens = estimateMessagesTokens([]);
    expect(tokens).toBe(0);
  });

  it("should estimate tokens correctly for multiple messages with mixed content", () => {
    // Create a mock image part using LanguageModelDataPart.image()
    const mockImagePart = LanguageModelDataPart.image(
      new Uint8Array([1, 2, 3, 4]),
      "image/png"
    );

    const messages = [
      new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.User,
        [
          new vscode.LanguageModelTextPart("First message"),
          mockImagePart,
        ] as vscode.LanguageModelInputPart[]
      ),
      new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.Assistant,
        [new vscode.LanguageModelTextPart("Response")]
      ),
      new vscode.LanguageModelChatMessage(
        vscode.LanguageModelChatMessageRole.User,
        [
          new vscode.LanguageModelTextPart("Follow up"),
          mockImagePart,
        ] as vscode.LanguageModelInputPart[]
      ),
    ];
    const tokens = estimateMessagesTokens(messages);
    // Text: 13 + 8 + 10 = 31 chars
    // Images: 2 * 1500 = 3000
    // Total: 3031 / 4 ≈ 758
    expect(tokens).toBeGreaterThan(3000);
  });
});
