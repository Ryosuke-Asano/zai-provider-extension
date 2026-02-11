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
const MAX_TOOL_RESULT_CHARS = 20000;
const MAX_TOOLS_PER_REQUEST = 128;

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

  /** Track if we emitted the begin-tool-calls whitespace hint */
  private _emittedBeginToolCallsHint = false;

  /** Buffer for text-embedded tool call token parsing */
  private _textToolParserBuffer = "";

  /** Active text-embedded tool call being assembled */
  private _textToolActive:
    | {
        name?: string;
        index?: number;
        argBuffer: string;
        emitted?: boolean;
      }
    | undefined;

  /** Deduplicate tool calls parsed from text and structured deltas */
  private _emittedTextToolCallKeys = new Set<string>();
  private _emittedTextToolCallIds = new Set<string>();

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
   * Convert HTTP status codes from upstream to LanguageModelError when possible.
   */
  private toLanguageModelError(
    status: number,
    statusText: string,
    details: string
  ): Error {
    const message = `Z.ai API error: ${status} ${statusText}${details ? `\n${details}` : ""}`;
    if (status === 401 || status === 403) {
      return vscode.LanguageModelError.NoPermissions(message);
    }
    if (status === 404) {
      return vscode.LanguageModelError.NotFound(message);
    }
    if (status === 429) {
      return vscode.LanguageModelError.Blocked(message);
    }
    return new Error(message);
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
    const publicModels = models.filter((m) => !m.internal);
    console.log(
      `[Z.ai Provider] Found ${models.length} models (${publicModels.length} public)`
    );

    const infos: LanguageModelChatInformation[] = publicModels.map(
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
            toolCalling: model.supportsTools ? MAX_TOOLS_PER_REQUEST : false,
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
   * Rough token estimate for tool definitions by JSON size.
   */
  private estimateToolTokens(tools: ZaiRequestBody["tools"]): number {
    if (!tools || tools.length === 0) {
      return 0;
    }
    try {
      return Math.ceil(JSON.stringify(tools).length / 4);
    } catch {
      return 0;
    }
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
          throw new vscode.CancellationError();
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
    this._emittedBeginToolCallsHint = false;
    this._textToolParserBuffer = "";
    this._textToolActive = undefined;
    this._emittedTextToolCallKeys.clear();
    this._emittedTextToolCallIds.clear();
    const abortController = new AbortController();
    const cancellationSubscription = token.onCancellationRequested(() => {
      abortController.abort();
    });

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
        throw vscode.LanguageModelError.NoPermissions("Z.ai API key not found");
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

      if (options.tools && options.tools.length > MAX_TOOLS_PER_REQUEST) {
        throw new Error(
          `Cannot have more than ${MAX_TOOLS_PER_REQUEST} tools per request.`
        );
      }

      const toolConfig = convertTools(options);
      const zaiMessages = convertMessages(processedMessages, {
        maxToolResultChars: MAX_TOOL_RESULT_CHARS,
      });
      validateRequest(processedMessages);

      // Estimate tokens (rough approximation)
      const inputTokenCount = estimateMessagesTokens(processedMessages, {
        maxToolResultChars: MAX_TOOL_RESULT_CHARS,
      });
      const toolTokenCount = this.estimateToolTokens(toolConfig.tools);
      const effectiveModelInfo = this.getModelInfo(effectiveModelId);
      const tokenLimit = Math.max(
        1,
        effectiveModelInfo
          ? effectiveModelInfo.contextWindow - effectiveModelInfo.maxOutput
          : model.maxInputTokens
      );
      const totalEstimatedTokens = inputTokenCount + toolTokenCount;
      if (totalEstimatedTokens > tokenLimit) {
        console.error("[Z.ai Model Provider] Message exceeds token limit", {
          total: totalEstimatedTokens,
          messageTokens: inputTokenCount,
          toolTokens: toolTokenCount,
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
      if (toolConfig.tool_choice) {
        requestBody.tool_choice = toolConfig.tool_choice;
      }

      console.log("[Z.ai Model Provider] 🚀 Starting chat request", {
        model: effectiveModelId,
        messageCount: messages.length,
        thinkingEnabled: this.isThinkingEnabled(),
        timestamp: new Date().toISOString(),
      });

      if (token.isCancellationRequested) {
        throw new vscode.CancellationError();
      }
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": this.userAgent,
        },
        signal: abortController.signal,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Z.ai Model Provider] API error response", errorText);
        throw this.toLanguageModelError(
          response.status,
          response.statusText,
          errorText
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
      if (
        token.isCancellationRequested ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        throw new vscode.CancellationError();
      }
      console.error("[Z.ai Model Provider] Chat request failed", {
        modelId: model.id,
        messageCount: messages.length,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message }
            : String(err),
      });
      throw err;
    } finally {
      cancellationSubscription.dispose();
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
            // Do not throw on DONE for incomplete tool call JSON.
            await this.flushToolCallBuffers(progress, false);
            await this.flushActiveTextToolCall(progress);
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
      this._emittedBeginToolCallsHint = false;
      this._textToolParserBuffer = "";
      this._textToolActive = undefined;
      this._emittedTextToolCallKeys.clear();
      this._emittedTextToolCallIds.clear();
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
        const formattedReasoning = this.formatReasoningContent(
          this._reasoningContentBuffer,
          true
        );
        const reasoningText = new vscode.LanguageModelTextPart(
          formattedReasoning
        );
        progress.report(reasoningText);
        this._reasoningContentBuffer = "";
      }

      const textResult = this.processTextContent(content, progress);
      if (textResult.emittedText) {
        this._hasEmittedAssistantText = true;
      }
      if (textResult.emittedAny) {
        emitted = true;
      }
    }

    // Handle tool calls
    if (deltaObj?.tool_calls) {
      const toolCalls = deltaObj.tool_calls;

      // Emit a whitespace hint to flush UI rendering once tool calls begin
      if (
        !this._emittedBeginToolCallsHint &&
        this._hasEmittedAssistantText &&
        toolCalls.length > 0
      ) {
        progress.report(new vscode.LanguageModelTextPart(" "));
        this._emittedBeginToolCallsHint = true;
      }

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
   * Parse provider control tokens embedded in streamed text and emit text/tool calls.
   */
  private processTextContent(
    input: string,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>
  ): { emittedText: boolean; emittedAny: boolean } {
    const BEGIN = "<|tool_call_begin|>";
    const ARG_BEGIN = "<|tool_call_argument_begin|>";
    const END = "<|tool_call_end|>";

    let data = this._textToolParserBuffer + input;
    let emittedText = false;
    let emittedAny = false;
    let visibleOut = "";

    while (data.length > 0) {
      if (!this._textToolActive) {
        const b = data.indexOf(BEGIN);
        if (b === -1) {
          let longestPartialPrefix = 0;
          for (
            let k = Math.min(BEGIN.length - 1, data.length - 1);
            k > 0;
            k--
          ) {
            if (data.endsWith(BEGIN.slice(0, k))) {
              longestPartialPrefix = k;
              break;
            }
          }

          if (longestPartialPrefix > 0) {
            const visible = data.slice(0, data.length - longestPartialPrefix);
            if (visible) {
              visibleOut += this.stripControlTokens(visible);
            }
            this._textToolParserBuffer = data.slice(
              data.length - longestPartialPrefix
            );
            data = "";
            break;
          }

          const lines = data.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const emittedJsonTool = this.tryEmitJsonToolCallLine(line, progress);
            if (emittedJsonTool) {
              emittedAny = true;
              continue;
            }
            visibleOut += this.stripControlTokens(line);
            if (i < lines.length - 1) {
              visibleOut += "\n";
            }
          }
          data = "";
          break;
        }

        const pre = data.slice(0, b);
        if (pre) {
          visibleOut += this.stripControlTokens(pre);
        }
        data = data.slice(b + BEGIN.length);

        const a = data.indexOf(ARG_BEGIN);
        const e = data.indexOf(END);
        let delimIdx = -1;
        let delimKind: "arg" | "end" | undefined;
        if (a !== -1 && (e === -1 || a < e)) {
          delimIdx = a;
          delimKind = "arg";
        } else if (e !== -1) {
          delimIdx = e;
          delimKind = "end";
        } else {
          this._textToolParserBuffer = BEGIN + data;
          data = "";
          break;
        }

        const header = data.slice(0, delimIdx).trim();
        const m = header.match(/^([A-Za-z0-9_\-.]+)(?::(\d+))?/);
        const name = m?.[1];
        const index = m?.[2] ? Number(m[2]) : undefined;
        this._textToolActive = { name, index, argBuffer: "", emitted: false };

        if (delimKind === "arg") {
          data = data.slice(delimIdx + ARG_BEGIN.length);
        } else {
          data = data.slice(delimIdx + END.length);
          const did = this.emitTextToolCallIfValid(
            progress,
            this._textToolActive,
            "{}"
          );
          if (did) {
            this._textToolActive.emitted = true;
            emittedAny = true;
          }
          this._textToolActive = undefined;
        }
        continue;
      }

      const e2 = data.indexOf(END);
      if (e2 === -1) {
        this._textToolActive.argBuffer += data;
        if (!this._textToolActive.emitted) {
          const did = this.emitTextToolCallIfValid(
            progress,
            this._textToolActive,
            this._textToolActive.argBuffer
          );
          if (did) {
            this._textToolActive.emitted = true;
            emittedAny = true;
          }
        }
        data = "";
        break;
      }

      this._textToolActive.argBuffer += data.slice(0, e2);
      data = data.slice(e2 + END.length);
      if (!this._textToolActive.emitted) {
        const did = this.emitTextToolCallIfValid(
          progress,
          this._textToolActive,
          this._textToolActive.argBuffer
        );
        if (did) {
          emittedAny = true;
        }
      }
      this._textToolActive = undefined;
    }

    if (visibleOut.length > 0) {
      progress.report(new vscode.LanguageModelTextPart(visibleOut));
      emittedText = true;
      emittedAny = true;
    }

    this._textToolParserBuffer = data;
    return { emittedText, emittedAny };
  }

  /**
   * Detect and emit tool calls serialized as plain JSON text lines.
   */
  private tryEmitJsonToolCallLine(
    line: string,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>
  ): boolean {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
      return false;
    }

    const parsed = tryParseJSONObject<Record<string, Json>>(trimmed);
    if (!parsed.ok) {
      return false;
    }

    const obj = parsed.value;
    const fn = (obj.function ?? null) as Record<string, Json> | null;
    const name =
      typeof obj.name === "string"
        ? obj.name
        : fn && typeof fn.name === "string"
          ? fn.name
          : undefined;
    if (!name) {
      return false;
    }

    const callId =
      typeof obj.callId === "string"
        ? obj.callId
        : typeof obj.id === "string"
          ? obj.id
          : undefined;

    let input: Record<string, Json> | undefined;
    const inputVal = obj.input;
    if (
      inputVal &&
      typeof inputVal === "object" &&
      !Array.isArray(inputVal)
    ) {
      input = inputVal as Record<string, Json>;
    }

    if (!input) {
      const argsVal = obj.arguments ?? fn?.arguments;
      if (typeof argsVal === "string") {
        const parsedArgs = tryParseJSONObject<Record<string, Json>>(argsVal);
        if (!parsedArgs.ok) {
          return false;
        }
        input = parsedArgs.value;
      } else if (
        argsVal &&
        typeof argsVal === "object" &&
        !Array.isArray(argsVal)
      ) {
        input = argsVal as Record<string, Json>;
      }
    }

    if (!input) {
      return false;
    }

    try {
      const canonical = JSON.stringify(input);
      const key = `${name}:${canonical}`;
      if (this._emittedTextToolCallKeys.has(key)) {
        return true;
      }
      this._emittedTextToolCallKeys.add(key);
      if (callId) {
        this._emittedTextToolCallIds.add(`${name}:${callId}`);
      }
    } catch {
      // Fall through and emit even if canonicalization fails.
    }

    progress.report(
      new vscode.LanguageModelToolCallPart(
        callId ?? `jtc_${Math.random().toString(36).slice(2, 10)}`,
        name,
        input
      )
    );
    return true;
  }

  private emitTextToolCallIfValid(
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    call: { name?: string; index?: number; argBuffer: string; emitted?: boolean },
    argText: string
  ): boolean {
    const name = call.name ?? "unknown_tool";
    const parsed = tryParseJSONObject<Record<string, Json>>(argText);
    if (!parsed.ok) {
      return false;
    }

    const canonical = JSON.stringify(parsed.value);
    const key = `${name}:${canonical}`;
    if (typeof call.index === "number") {
      const idKey = `${name}:${call.index}`;
      if (this._emittedTextToolCallIds.has(idKey)) {
        return false;
      }
      this._emittedTextToolCallIds.add(idKey);
    } else if (this._emittedTextToolCallKeys.has(key)) {
      return false;
    }

    this._emittedTextToolCallKeys.add(key);
    const id = `tct_${Math.random().toString(36).slice(2, 10)}`;
    progress.report(new vscode.LanguageModelToolCallPart(id, name, parsed.value));
    return true;
  }

  private flushActiveTextToolCall(
    progress: vscode.Progress<vscode.LanguageModelResponsePart>
  ): Promise<void> {
    if (!this._textToolActive) {
      return Promise.resolve();
    }
    const argText = this._textToolActive.argBuffer;
    const parsed = tryParseJSONObject<Record<string, Json>>(argText);
    if (!parsed.ok) {
      return Promise.resolve();
    }
    this.emitTextToolCallIfValid(progress, this._textToolActive, argText);
    this._textToolActive = undefined;
    return Promise.resolve();
  }

  /** Strip provider control tokens from visible streamed text. */
  private stripControlTokens(text: string): string {
    try {
      return text
        .replace(/<\|[a-zA-Z0-9_-]+_section_(?:begin|end)\|>/g, "")
        .replace(/<\|tool_call_(?:argument_)?(?:begin|end)\|>/g, "");
    } catch {
      return text;
    }
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
    try {
      const canonical = JSON.stringify(parameters);
      this._emittedTextToolCallKeys.add(`${buf.name}:${canonical}`);
    } catch {
      // Ignore JSON serialization errors; tool call can still be emitted.
    }
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
      try {
        const canonical = JSON.stringify(parameters);
        this._emittedTextToolCallKeys.add(`${name}:${canonical}`);
      } catch {
        // Ignore JSON serialization errors; tool call can still be emitted.
      }
      progress.report(
        new vscode.LanguageModelToolCallPart(id, name, parameters)
      );
      this._toolCallBuffers.delete(idx);
      this._completedToolCallIndices.add(idx);
    }
    return Promise.resolve();
  }
}
