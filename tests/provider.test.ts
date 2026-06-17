/// <reference types="jest" />

import * as vscode from "vscode";

import { ZaiChatModelProvider } from "../src/provider";
import { secrets } from "../__mocks__/vscode";

function createDoneStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
      controller.close();
    },
  });
}

function createToken(): vscode.CancellationToken {
  return {
    isCancellationRequested: false,
    onCancellationRequested: jest.fn(() => ({ dispose: jest.fn() })),
  } as unknown as vscode.CancellationToken;
}

describe("ZaiChatModelProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (secrets.get as jest.Mock).mockResolvedValue("test-api-key");
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
      get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: createDoneStream(),
    });
  });

  it("should expose the full context window as maxInputTokens", async () => {
    const provider = new ZaiChatModelProvider(
      secrets as unknown as vscode.SecretStorage,
      "jest-agent"
    );

    const models = await provider.provideLanguageModelChatInformation(
      { silent: true } as vscode.PrepareLanguageModelChatModelOptions,
      createToken()
    );

    const glm47 = models.find((m) => m.id === "glm-4.7");
    expect(glm47).toBeDefined();
    expect(glm47?.maxInputTokens).toBe(202752 - Math.min(65535, 65536));
    expect(glm47?.maxOutputTokens).toBe(65535);
  });

  it("should allow prompts larger than the old reserved-output cap", async () => {
    const provider = new ZaiChatModelProvider(
      secrets as unknown as vscode.SecretStorage,
      "jest-agent"
    );
    const models = await provider.provideLanguageModelChatInformation(
      { silent: true } as vscode.PrepareLanguageModelChatModelOptions,
      createToken()
    );
    const glm5 = models.find((m) => m.id === "glm-5");
    if (!glm5) {
      throw new Error("glm-5 not found");
    }

    const largePrompt = "a".repeat(72000 * 4);
    const messages = [vscode.LanguageModelChatMessage.User(largePrompt)];
    const progress = {
      report: jest.fn(),
    } as unknown as vscode.Progress<vscode.LanguageModelResponsePart>;

    await expect(
      provider.provideLanguageModelChatResponse(
        glm5,
        messages,
        {},
        progress,
        createToken()
      )
    ).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("should use the official default max_tokens when not specified", async () => {
    const provider = new ZaiChatModelProvider(
      secrets as unknown as vscode.SecretStorage,
      "jest-agent"
    );
    const models = await provider.provideLanguageModelChatInformation(
      { silent: true } as vscode.PrepareLanguageModelChatModelOptions,
      createToken()
    );
    const glm47 = models.find((m) => m.id === "glm-4.7");
    if (!glm47) {
      throw new Error("glm-4.7 not found");
    }

    const messages = [vscode.LanguageModelChatMessage.User("hello")];
    const progress = {
      report: jest.fn(),
    } as unknown as vscode.Progress<vscode.LanguageModelResponsePart>;

    await provider.provideLanguageModelChatResponse(
      glm47,
      messages,
      {},
      progress,
      createToken()
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const requestInit = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
      body?: string;
    };
    expect(requestInit.body).toBeDefined();
    const requestBody = JSON.parse(requestInit.body ?? "{}");
    expect(requestBody.max_tokens).toBe(65535);
  });

  it("should reject prompts that exceed the documented context window", async () => {
    const provider = new ZaiChatModelProvider(
      secrets as unknown as vscode.SecretStorage,
      "jest-agent"
    );
    const models = await provider.provideLanguageModelChatInformation(
      { silent: true } as vscode.PrepareLanguageModelChatModelOptions,
      createToken()
    );
    const glm5 = models.find((m) => m.id === "glm-5");
    if (!glm5) {
      throw new Error("glm-5 not found");
    }

    const tooLargePrompt = "a".repeat(202753 * 4);
    const messages = [vscode.LanguageModelChatMessage.User(tooLargePrompt)];
    const progress = {
      report: jest.fn(),
    } as unknown as vscode.Progress<vscode.LanguageModelResponsePart>;

    await expect(
      provider.provideLanguageModelChatResponse(
        glm5,
        messages,
        {},
        progress,
        createToken()
      )
    ).rejects.toThrow("Message exceeds token limit.");

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should count tokens for text data parts in provideTokenCount", async () => {
    const provider = new ZaiChatModelProvider(
      secrets as unknown as vscode.SecretStorage,
      "jest-agent"
    );
    const models = await provider.provideLanguageModelChatInformation(
      { silent: true } as vscode.PrepareLanguageModelChatModelOptions,
      createToken()
    );
    const glm5 = models.find((m) => m.id === "glm-5");
    if (!glm5) {
      throw new Error("glm-5 not found");
    }

    const text = "text from LanguageModelDataPart";
    const message = vscode.LanguageModelChatMessage.User([
      vscode.LanguageModelDataPart.text(text),
    ]);

    const count = await provider.provideTokenCount(
      glm5,
      message,
      createToken()
    );
    expect(count).toBe(Math.ceil(text.length / 2));
  });

  it("should expose a Thinking Effort configurationSchema only for GLM-5.2", async () => {
    const provider = new ZaiChatModelProvider(
      secrets as unknown as vscode.SecretStorage,
      "jest-agent"
    );
    const models = await provider.provideLanguageModelChatInformation(
      { silent: true } as vscode.PrepareLanguageModelChatModelOptions,
      createToken()
    );

    const glm52 = models.find((m) => m.id === "glm-5.2");
    expect(glm52).toBeDefined();
    const prop = glm52?.configurationSchema?.properties?.reasoningEffort;
    expect(prop).toBeDefined();
    expect(prop?.type).toBe("string");
    // Only the three levels that produce a distinct outcome on GLM-5.2. The
    // other documented values are server-side aliases that collapse onto these
    // (xhigh→max; low/medium→high; minimal→none), so they are not offered.
    expect(prop?.enum).toEqual(["max", "high", "none"]);
    expect(prop?.default).toBe("max");
    expect(prop?.group).toBe("navigation");

    // Other models must not expose the picker.
    const glm5 = models.find((m) => m.id === "glm-5");
    expect(glm5?.configurationSchema).toBeUndefined();
  });

  it("should forward reasoning_effort for GLM-5.2 when selected in the picker", async () => {
    const provider = new ZaiChatModelProvider(
      secrets as unknown as vscode.SecretStorage,
      "jest-agent"
    );
    const models = await provider.provideLanguageModelChatInformation(
      { silent: true } as vscode.PrepareLanguageModelChatModelOptions,
      createToken()
    );
    const glm52 = models.find((m) => m.id === "glm-5.2");
    if (!glm52) {
      throw new Error("glm-5.2 not found");
    }

    const messages = [vscode.LanguageModelChatMessage.User("hello")];
    const progress = {
      report: jest.fn(),
    } as unknown as vscode.Progress<vscode.LanguageModelResponsePart>;

    await provider.provideLanguageModelChatResponse(
      glm52,
      messages,
      {
        modelConfiguration: { reasoningEffort: "high" },
      } as vscode.ProvideLanguageModelChatResponseOptions,
      progress,
      createToken()
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const requestInit = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
      body?: string;
    };
    const requestBody = JSON.parse(requestInit.body ?? "{}");
    expect(requestBody.thinking).toEqual({ type: "enabled" });
    expect(requestBody.reasoning_effort).toBe("high");
  });

  it("should omit reasoning_effort for non-supporting models even when configured", async () => {
    const provider = new ZaiChatModelProvider(
      secrets as unknown as vscode.SecretStorage,
      "jest-agent"
    );
    const models = await provider.provideLanguageModelChatInformation(
      { silent: true } as vscode.PrepareLanguageModelChatModelOptions,
      createToken()
    );
    const glm5 = models.find((m) => m.id === "glm-5");
    if (!glm5) {
      throw new Error("glm-5 not found");
    }

    const messages = [vscode.LanguageModelChatMessage.User("hello")];
    const progress = {
      report: jest.fn(),
    } as unknown as vscode.Progress<vscode.LanguageModelResponsePart>;

    await provider.provideLanguageModelChatResponse(
      glm5,
      messages,
      {
        modelConfiguration: { reasoningEffort: "high" },
      } as vscode.ProvideLanguageModelChatResponseOptions,
      progress,
      createToken()
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const requestInit = (global.fetch as jest.Mock).mock.calls[0]?.[1] as {
      body?: string;
    };
    const requestBody = JSON.parse(requestInit.body ?? "{}");
    expect(requestBody.reasoning_effort).toBeUndefined();
  });
});
