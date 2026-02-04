import * as vscode from "vscode";
import {
  CancellationToken,
  LanguageModelChatInformation,
  LanguageModelChatMessage,
  LanguageModelChatProvider,
  ProvideLanguageModelChatResponseOptions,
  LanguageModelResponsePart,
  Progress,
  PrepareLanguageModelChatModelOptions,
  EventEmitter,
  Event,
} from "vscode";

import type {
  ZaiModelInfo,
  ZaiStreamResponse,
  Json,
  ZaiRequestBody,
} from "./types";
import { ZAI_MODELS } from "./types";
import {
  convertMessages,
  convertTools,
  tryParseJSONObject,
  validateRequest,
  estimateMessagesTokens,
  getTextPartValue,
  extractImageData,
} from "./utils";
import { ZaiMcpClient } from "./mcp";

const BASE_URL = "https://api.z.ai/api/coding/paas/v4";

/**
 * VS Code Chat provider backed by Z.ai API.
 */
export class ZaiChatModelProvider implements LanguageModelChatProvider {
  /** Buffer for assembling streamed tool calls by index. */
  private _toolCallBuffers: Map<
    number,
    { id?: string; name?: string; args: string }
  > = new Map();

  /** Indices for which a tool call has been fully emitted. */
  private _completedToolCallIndices = new Set<number>();

  /** Track if we emitted any assistant text before seeing tool calls */
  private _hasEmittedAssistantText = false;

  /** Track if we emitted any thinking/reasoning content */
  private _hasEmittedThinkingContent = false;

  /** Buffer for reasoning content from thinking mode */
  private _reasoningContentBuffer = "";

  /** Debug counter */
  private _debugCallCount = 0;

  /** Event emitter for model information changes */
  private readonly _onDidChangeLanguageModelChatInformation =
    new EventEmitter<void>();

  /** Event that fires when available language models change */
  readonly onDidChangeLanguageModelChatInformation: Event<void> =
    this._onDidChangeLanguageModelChatInformation.event;

  /**
   * Fire the onDidChangeLanguageModelChatInformation event
   * Call this when the list of available models changes
   */
  fireModelInfoChanged(): void {
    this._onDidChangeLanguageModelChatInformation.fire();
  }

  /**
   * Format reasoning content with proper markdown formatting.
   * Each line is prefixed with '> ' for quote block display.
   */
  private formatReasoningContent(content: string, isComplete: boolean): string {
    // Normalize line endings and trim
    const normalized = content.replace(/\r\n/g, "\n").trim();

    // Split into lines and add quote prefix to each
    const quotedLines = normalized
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");

    const header = isComplete
      ? "> **🧠 Thinking Process**"
      : "> *🧠 Thinking...*";
    return `${header}\n>\n${quotedLines}\n\n---\n\n`;
  }

  /** MCP client for GLM-OCR image processing and other tools */
  private _mcpClient: ZaiMcpClient;

  /**
   * Create a provider using the given secret storage for the API key.
   * @param secrets VS Code secret storage.
   * @param userAgent User agent string for API requests.
   */
  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly userAgent: string
  ) {
    this._mcpClient = new ZaiMcpClient(secrets);
  }

  /**
   * Get the configuration setting for enabling thinking display.
   */
  private isThinkingEnabled(): boolean {
    const config = vscode.workspace.getConfiguration("zai");
    return config.get<boolean>("enableThinking", true);
  }

  /**
   * Get the list of available language models contributed by this provider
   * @param options Options which specify the calling context of this function
   * @param token A cancellation token which signals if the user cancelled the request or not
   * @returns A promise that resolves to the list of available language models
   */
  async provideLanguageModelChatInformation(
    options: PrepareLanguageModelChatModelOptions,
    _token: CancellationToken
  ): Promise<LanguageModelChatInformation[]> {
    this._debugCallCount++;
    console.log("[Z.ai Provider] provideLanguageModelChatInformation called", {
      silent: options.silent,
      callCount: this._debugCallCount,
      timestamp: new Date().toISOString(),
    });
    const apiKey = await this.ensureApiKey(options.silent);
    if (!apiKey) {
      console.log("[Z.ai Provider] No API key, returning empty list");
      return [];
    }

    // Import models from types
    const { ZAI_MODELS: models } = await import("./types");
    console.log(`[Z.ai Provider] Found ${models.length} models`);

    const infos: LanguageModelChatInformation[] = models.map(
      (model: ZaiModelInfo) => {
        console.log(`[Z.ai Provider] Model info: ${model.id}`, {
          supportsVision: model.supportsVision,
          supportsTools: model.supportsTools,
          contextWindow: model.contextWindow,
          maxOutput: model.maxOutput,
        });
        return {
          id: model.id,
          name: model.displayName,
          tooltip: `Z.ai ${model.name}`,
          family: "zai",
          version: "1.0.0",
          maxInputTokens: Math.max(1, model.contextWindow - model.maxOutput),
          maxOutputTokens: model.maxOutput,
          capabilities: {
            toolCalling: model.supportsTools,
            imageInput: true, // Image input allowed; non-vision models auto-route
          },
        };
      }
    );

    console.log(`[Z.ai Provider] Returning ${infos.length} models`);
    return infos;
  }

  /**
   * Check if model supports vision natively
   */
  private modelSupportsVision(modelId: string): boolean {
    const modelInfo = ZAI_MODELS.find((m) => m.id === modelId);
    return modelInfo?.supportsVision ?? false;
  }

  /**
   * Pick a fallback vision model for image input
   */
  private getVisionFallbackModelId(): string | undefined {
    const preferred = ZAI_MODELS.find(
      (m) => m.id === "glm-4.6v" && m.supportsVision
    );
    if (preferred) {
      return preferred.id;
    }
    return ZAI_MODELS.find((m) => m.supportsVision)?.id;
  }

  /**
   * Check if any message contains image input parts
   */
  private hasImageInput(
    messages: readonly LanguageModelChatMessage[]
  ): boolean {
    for (const msg of messages) {
      for (const part of msg.content) {
        if (extractImageData(part)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Get model info by id
   */
  private getModelInfo(modelId: string): ZaiModelInfo | undefined {
    return ZAI_MODELS.find((m) => m.id === modelId);
  }

  /**
   * Pre-process messages to handle images
   * Converts images to text descriptions using GLM-OCR MCP
   */
  private async processImagesForNonVisionModel(
    messages: readonly LanguageModelChatMessage[],
    _modelId: string,
    token: CancellationToken
  ): Promise<{
    processedMessages: LanguageModelChatMessage[];
    imageDescriptions: string[];
  }> {
    const imageDescriptions: string[] = [];
    const processedMessages: LanguageModelChatMessage[] = [];

    for (const msg of messages) {
      // Extract text from message
      const textParts: string[] = [];
      for (const part of msg.content) {
        const v = getTextPartValue(part);
        if (v !== undefined) {
          textParts.push(v);
        }
      }
      const userPrompt = textParts.join(" ");

      // Extract image data parts (supports DataPart and legacy shapes)
      const images: Array<{ mimeType: string; data: Uint8Array }> = [];
      for (const part of msg.content) {
        const img = extractImageData(part);
        if (img) {
          images.push(img);
        }
      }

      if (images.length === 0) {
        // No images, keep message as-is
        processedMessages.push(msg);
        continue;
      }

      // Analyze images for this message
      const thisMessageDescriptions: string[] = [];
      for (const img of images) {
        if (token.isCancellationRequested) {
          throw new Error("Cancelled");
        }

        const base64Data = Buffer.from(img.data).toString("base64");
        const imageDataUrl = `data:${img.mimeType};base64,${base64Data}`;

        const analysisPrompt = userPrompt || "Describe this image in detail.";
        const description = await this._mcpClient.analyzeImage(
          imageDataUrl,
          analysisPrompt
        );
        thisMessageDescriptions.push(description);
      }

      // Replace image with text description for non-Vision model
      const newContent: vscode.LanguageModelTextPart[] = [];
      for (const textPart of textParts) {
        newContent.push(new vscode.LanguageModelTextPart(textPart));
      }

      // Add image descriptions as text (only those for this message)
      if (thisMessageDescriptions.length > 0) {
        newContent.push(
          new vscode.LanguageModelTextPart(
            `\n\n[Image Analysis]:\n${thisMessageDescriptions.join("\n\n---\n\n")}`
          )
        );
      }

      processedMessages.push(vscode.LanguageModelChatMessage.User(newContent));
    }

    return { processedMessages, imageDescriptions };
  }

  /**
   * Returns the response for a chat request, passing the results to the progress callback.
   * @param model The language model to use
   * @param messages The messages to include in the request
   * @param options Options for the request
   * @param progress The progress to emit the streamed response chunks to
   * @param token A cancellation token for the request
   * @returns A promise that resolves when the response is complete.
   */
  async provideLanguageModelChatResponse(
    model: LanguageModelChatInformation,
    messages: readonly LanguageModelChatMessage[],
    options: ProvideLanguageModelChatResponseOptions,
    progress: Progress<LanguageModelResponsePart>,
    token: CancellationToken
  ): Promise<void> {
    // Reset state
    this._toolCallBuffers.clear();
    this._completedToolCallIndices.clear();
    this._hasEmittedAssistantText = false;

    const trackingProgress: Progress<LanguageModelResponsePart> = {
      report: (part) => {
        try {
          progress.report(part);
        } catch (e) {
          console.error("[Z.ai Model Provider] Progress.report failed", {
            modelId: model.id,
            error:
              e instanceof Error
                ? { name: e.name, message: e.message }
                : String(e),
          });
        }
      },
    };

    try {
      const apiKey = await this.ensureApiKey(true);
      if (!apiKey) {
        throw new Error("Z.ai API key not found");
      }

      const hasImages = this.hasImageInput(messages);
      let processedMessages = messages;
      let effectiveModelId = model.id;

      if (hasImages) {
        if (!this.modelSupportsVision(model.id)) {
          const visionFallback = this.getVisionFallbackModelId();
          if (visionFallback && visionFallback !== model.id) {
            console.warn(
              "[Z.ai Model Provider] Switching to vision model for image input",
              {
                originalModel: model.id,
                visionModel: visionFallback,
              }
            );
            effectiveModelId = visionFallback;
          } else {
            console.warn(
              "[Z.ai Model Provider] No vision model available, using OCR fallback"
            );
            const result = await this.processImagesForNonVisionModel(
              messages,
              model.id,
              token
            );
            processedMessages = result.processedMessages;
          }
        }
      }

      const zaiMessages = convertMessages(processedMessages);
      validateRequest(processedMessages);

      const toolConfig = convertTools(options);

      if (options.tools && options.tools.length > 128) {
        throw new Error("Cannot have more than 128 tools per request.");
      }

      // Estimate tokens (rough approximation)
      const inputTokenCount = estimateMessagesTokens(processedMessages);
      const effectiveModelInfo = this.getModelInfo(effectiveModelId);
      const tokenLimit = Math.max(
        1,
        effectiveModelInfo
          ? effectiveModelInfo.contextWindow - effectiveModelInfo.maxOutput
          : model.maxInputTokens
      );
      if (inputTokenCount > tokenLimit) {
        console.error("[Z.ai Model Provider] Message exceeds token limit", {
          total: inputTokenCount,
          tokenLimit,
        });
        throw new Error("Message exceeds token limit.");
      }

      const mo = options.modelOptions as Record<string, Json> | undefined;
      const maxTokensVal =
        typeof mo?.max_tokens === "number" ? mo.max_tokens : 4096;
      const temperatureVal =
        typeof mo?.temperature === "number" ? mo.temperature : 0.7;

      const effectiveMaxOutputTokens =
        effectiveModelInfo?.maxOutput ?? model.maxOutputTokens;
      const requestBody: ZaiRequestBody = {
        model: effectiveModelId,
        messages: zaiMessages,
        stream: true,
        max_tokens: Math.min(maxTokensVal, effectiveMaxOutputTokens),
        temperature: temperatureVal,
      };

      // Enable thinking mode if setting is enabled
      if (this.isThinkingEnabled()) {
        requestBody.thinking = {
          type: "enabled",
        };
      }

      // Allow-list model options
      if (mo) {
        if (typeof mo.stop === "string") {
          requestBody.stop = mo.stop;
        } else if (
          Array.isArray(mo.stop) &&
          mo.stop.every((s) => typeof s === "string")
        ) {
          requestBody.stop = mo.stop;
        }
        if (typeof mo.frequency_penalty === "number") {
          requestBody.frequency_penalty = mo.frequency_penalty;
        }
        if (typeof mo.presence_penalty === "number") {
          requestBody.presence_penalty = mo.presence_penalty;
        }
      }

      if (toolConfig.tools) {
        requestBody.tools = toolConfig.tools;
      }

      console.log("[Z.ai Model Provider] 🚀 Starting chat request", {
        model: model.id,
        messageCount: messages.length,
        thinkingEnabled: this.isThinkingEnabled(),
        timestamp: new Date().toISOString(),
      });

      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": this.userAgent,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Z.ai Model Provider] API error response", errorText);
        throw new Error(
          `Z.ai API error: ${response.status} ${response.statusText}${errorText ? `\n${errorText}` : ""}`
        );
      }

      if (!response.body) {
        throw new Error("No response body from Z.ai API");
      }

      await this.processStreamingResponse(
        response.body,
        trackingProgress,
        token
      );
    } catch (err) {
      console.error("[Z.ai Model Provider] Chat request failed", {
        modelId: model.id,
        messageCount: messages.length,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message }
            : String(err),
      });
      throw err;
    }
  }

  /**
   * Returns the number of tokens for a given text using the model specific tokenizer logic
   * @param model The language model to use
   * @param text The text to count tokens for
   * @param token A cancellation token for the request
   * @returns A promise that resolves to the number of tokens
   */
  provideTokenCount(
    _model: LanguageModelChatInformation,
    text: string | LanguageModelChatMessage,
    _token: CancellationToken
  ): Promise<number> {
    if (typeof text === "string") {
      return Promise.resolve(Math.ceil(text.length / 4));
    } else {
      let totalTokens = 0;
      for (const part of text.content) {
        const tv = getTextPartValue(part);
        if (tv !== undefined) {
          totalTokens += Math.ceil(tv.length / 4);
          continue;
        }
        const img = extractImageData(part);
        if (img) {
          // Rough estimate: images typically cost ~1000-2000 tokens
          totalTokens += 1500;
        }
      }
      return Promise.resolve(totalTokens);
    }
  }

  /**
   * Ensure an API key exists in SecretStorage, optionally prompting the user when not silent.
   * @param silent If true, do not prompt the user.
   */
  private async ensureApiKey(silent: boolean): Promise<string | undefined> {
    let apiKey = await this.secrets.get("zai.apiKey");
    if (!apiKey && !silent) {
      const entered = await vscode.window.showInputBox({
        title: "Z.ai API Key",
        prompt: "Enter your Z.ai API key",
        ignoreFocusOut: true,
        password: true,
      });
      if (entered && entered.trim()) {
        apiKey = entered.trim();
        await this.secrets.store("zai.apiKey", apiKey);
      }
    }
    return apiKey;
  }

  /**
   * Read and parse the Z.ai streaming (SSE) response and report parts.
   * @param responseBody The readable stream body.
   * @param progress Progress reporter for streamed parts.
   * @param token Cancellation token.
   */
  private async processStreamingResponse(
    responseBody: ReadableStream<Uint8Array>,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const reader = responseBody.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (!token.isCancellationRequested) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) {
            continue;
          }
          const data = line.slice(6);
          if (data === "[DONE]") {
            // Flush any buffered reasoning content if thinking is enabled
            if (this.isThinkingEnabled() && this._reasoningContentBuffer) {
              const formattedReasoning = this.formatReasoningContent(
                this._reasoningContentBuffer,
                true // isComplete
              );
              const reasoningText = new vscode.LanguageModelTextPart(
                formattedReasoning
              );
              progress.report(reasoningText);
              this._reasoningContentBuffer = "";
            }
            await this.flushToolCallBuffers(progress, true);
            continue;
          }

          try {
            const parsed = JSON.parse(data) as ZaiStreamResponse;
            await this.processDelta(parsed, progress);
          } catch {
            // Silently ignore malformed SSE lines temporarily
          }
        }
      }
    } finally {
      reader.releaseLock();
      // Clean up any leftover tool call state
      this._toolCallBuffers.clear();
      this._completedToolCallIndices.clear();
      this._hasEmittedAssistantText = false;
      this._hasEmittedThinkingContent = false;
      this._reasoningContentBuffer = "";
    }
  }

  /**
   * Handle a single streamed delta chunk, emitting text and tool call parts.
   * @param delta Parsed SSE chunk from Z.ai.
   * @param progress Progress reporter for parts.
   */
  private async processDelta(
    delta: ZaiStreamResponse,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>
  ): Promise<boolean> {
    let emitted = false;
    const choice = delta.choices?.[0];
    if (!choice) {
      return false;
    }

    const deltaObj = choice.delta;

    // Handle reasoning content (thinking process) - only if thinking is enabled
    if (this.isThinkingEnabled() && deltaObj?.reasoning_content) {
      const reasoning = String(deltaObj.reasoning_content);
      if (!this._hasEmittedThinkingContent) {
        console.log(
          "[Z.ai Model Provider] 🧠 Starting reasoning/thinking process...",
          {
            timestamp: new Date().toISOString(),
          }
        );
      }
      this._reasoningContentBuffer += reasoning;
      this._hasEmittedThinkingContent = true;
      emitted = true;
    }

    // Handle text content
    if (deltaObj?.content) {
      const content = String(deltaObj.content);

      // If we have reasoning content buffered and thinking is enabled, emit it first
      if (this.isThinkingEnabled() && this._reasoningContentBuffer) {
        console.log("[Z.ai Model Provider] 📦 Emitting reasoning content", {
          length: this._reasoningContentBuffer.length,
          timestamp: new Date().toISOString(),
        });
        // Use collapsible details section for completed reasoning
        const formattedReasoning = this.formatReasoningContent(
          this._reasoningContentBuffer,
          true // isComplete - reasoning is done, content is about to start
        );
        const reasoningText = new vscode.LanguageModelTextPart(
          formattedReasoning
        );
        progress.report(reasoningText);
        this._reasoningContentBuffer = "";
      }

      progress.report(new vscode.LanguageModelTextPart(content));
      this._hasEmittedAssistantText = true;
      emitted = true;
    }

    // Handle tool calls
    if (deltaObj?.tool_calls) {
      const toolCalls = deltaObj.tool_calls;

      for (const tc of toolCalls) {
        const idx = (tc as { index?: number }).index ?? 0;
        // Ignore any further deltas for an index we've already completed
        if (this._completedToolCallIndices.has(idx)) {
          continue;
        }
        const buf = this._toolCallBuffers.get(idx) ?? { args: "" };
        if (tc.id && typeof tc.id === "string") {
          buf.id = tc.id;
        }
        const func = tc.function;
        if (func?.name && typeof func.name === "string") {
          buf.name = func.name;
        }
        if (typeof func?.arguments === "string") {
          buf.args += func.arguments;
        }
        this._toolCallBuffers.set(idx, buf);

        // Emit immediately once arguments become valid JSON
        await this.tryEmitBufferedToolCall(idx, progress);
      }
    }

    const finish = choice.finish_reason;
    if (finish === "tool_calls" || finish === "stop") {
      // Emit any buffered calls
      await this.flushToolCallBuffers(progress, true);
    }

    return emitted;
  }

  /**
   * Try to emit a buffered tool call when a valid name and JSON arguments are available.
   * @param index The tool call index from the stream.
   * @param progress Progress reporter for parts.
   */
  private tryEmitBufferedToolCall(
    index: number,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>
  ): Promise<void> {
    const buf = this._toolCallBuffers.get(index);
    if (!buf) {
      return Promise.resolve();
    }
    if (!buf.name) {
      return Promise.resolve();
    }
    const canParse = tryParseJSONObject<Record<string, Json>>(buf.args);
    if (!canParse.ok) {
      return Promise.resolve();
    }
    const id = buf.id ?? `call_${Math.random().toString(36).slice(2, 10)}`;
    const parameters = canParse.value;
    progress.report(
      new vscode.LanguageModelToolCallPart(id, buf.name, parameters)
    );
    this._toolCallBuffers.delete(index);
    this._completedToolCallIndices.add(index);
    return Promise.resolve();
  }

  /**
   * Flush all buffered tool calls, optionally throwing if arguments are not valid JSON.
   * @param progress Progress reporter for parts.
   * @param throwOnInvalid If true, throw when a tool call has invalid JSON args.
   */
  private flushToolCallBuffers(
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    throwOnInvalid: boolean
  ): Promise<void> {
    if (this._toolCallBuffers.size === 0) {
      return Promise.resolve();
    }
    for (const [idx, buf] of Array.from(this._toolCallBuffers.entries())) {
      const parsed = tryParseJSONObject<Record<string, Json>>(buf.args);
      if (!parsed.ok) {
        if (throwOnInvalid) {
          console.error("[Z.ai Model Provider] Invalid JSON for tool call", {
            idx,
            snippet: (buf.args || "").slice(0, 200),
          });
          throw new Error("Invalid JSON for tool call");
        }
        // When not throwing (e.g. on [DONE]), drop silently
        continue;
      }
      const id = buf.id ?? `call_${Math.random().toString(36).slice(2, 10)}`;
      const name = buf.name ?? "unknown_tool";
      const parameters = parsed.value;
      progress.report(
        new vscode.LanguageModelToolCallPart(id, name, parameters)
      );
      this._toolCallBuffers.delete(idx);
      this._completedToolCallIndices.add(idx);
    }
    return Promise.resolve();
  }
}
