import * as vscode from "vscode";
import {
	CancellationToken,
	LanguageModelChatInformation,
	LanguageModelChatMessage,
	LanguageModelChatProvider,
	ProvideLanguageModelChatResponseOptions,
	LanguageModelResponsePart,
	Progress,
} from "vscode";

import type { ZaiModelInfo, ZAI_MODELS, ZaiStreamResponse } from "./types";
import { convertMessages, convertTools, tryParseJSONObject, validateRequest, estimateMessagesTokens } from "./utils";

const BASE_URL = "https://api.z.ai/api/paas/v4";

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

	/**
	 * Create a provider using the given secret storage for the API key.
	 * @param secrets VS Code secret storage.
	 * @param userAgent User agent string for API requests.
	 */
	constructor(
		private readonly secrets: vscode.SecretStorage,
		private readonly userAgent: string
	) {}

	/**
	 * Get the list of available language models contributed by this provider
	 * @param options Options which specify the calling context of this function
	 * @param token A cancellation token which signals if the user cancelled the request or not
	 * @returns A promise that resolves to the list of available language models
	 */
	async provideLanguageModelChatInformation(
		_options: { silent: boolean },
		_token: CancellationToken
	): Promise<LanguageModelChatInformation[]> {
		const apiKey = await this.ensureApiKey(_options.silent);
		if (!apiKey) {
			return [];
		}

		// Import models from types
		const { ZAI_MODELS: models } = await import("./types");

		const infos: LanguageModelChatInformation[] = models.map(
			(model: ZaiModelInfo) => ({
				id: model.id,
				name: model.displayName,
				tooltip: `Z.ai ${model.name}`,
				family: "zai",
				version: "1.0.0",
				maxInputTokens: Math.max(1, model.contextWindow - model.maxOutput),
				maxOutputTokens: model.maxOutput,
				capabilities: {
					toolCalling: model.supportsTools,
					imageInput: model.supportsVision,
				},
			})
		);

		return infos;
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
						error: e instanceof Error ? { name: e.name, message: e.message } : String(e),
					});
				}
			},
		};

		try {
			const apiKey = await this.ensureApiKey(true);
			if (!apiKey) {
				throw new Error("Z.ai API key not found");
			}

			const zaiMessages = convertMessages(messages);
			validateRequest(messages);

			const toolConfig = convertTools(options);

			if (options.tools && options.tools.length > 128) {
				throw new Error("Cannot have more than 128 tools per request.");
			}

			// Estimate tokens (rough approximation)
			const inputTokenCount = estimateMessagesTokens(messages);
			const tokenLimit = Math.max(1, model.maxInputTokens);
			if (inputTokenCount > tokenLimit) {
				console.error("[Z.ai Model Provider] Message exceeds token limit", {
					total: inputTokenCount,
					tokenLimit,
				});
				throw new Error("Message exceeds token limit.");
			}

			const requestBody: Record<string, unknown> = {
				model: model.id,
				messages: zaiMessages,
				stream: true,
				max_tokens: Math.min(
					options.modelOptions?.max_tokens || 4096,
					model.maxOutputTokens
				),
				temperature: options.modelOptions?.temperature ?? 0.7,
			};

			// Allow-list model options
			if (options.modelOptions) {
				const mo = options.modelOptions as Record<string, unknown>;
				if (typeof mo.stop === "string" || Array.isArray(mo.stop)) {
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
				error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
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
	async provideTokenCount(
		_model: LanguageModelChatInformation,
		text: string | LanguageModelChatMessage,
		_token: CancellationToken
	): Promise<number> {
		if (typeof text === "string") {
			return Math.ceil(text.length / 4);
		} else {
			let totalTokens = 0;
			for (const part of text.content) {
				if (part instanceof vscode.LanguageModelTextPart) {
					totalTokens += Math.ceil(part.value.length / 4);
				} else if ((part as any).type === "image") {
					// Rough estimate: images typically cost ~1000-2000 tokens
					totalTokens += 1500;
				}
			}
			return totalTokens;
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

		// Handle text content
		if (deltaObj?.content) {
			const content = String(deltaObj.content);
			progress.report(new vscode.LanguageModelTextPart(content));
			this._hasEmittedAssistantText = true;
			emitted = true;
		}

		// Handle tool calls
		if (deltaObj?.tool_calls) {
			const toolCalls = deltaObj.tool_calls;

			for (const tc of toolCalls) {
				const idx = (tc as any).index ?? 0;
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
	private async tryEmitBufferedToolCall(
		index: number,
		progress: vscode.Progress<vscode.LanguageModelResponsePart>
	): Promise<void> {
		const buf = this._toolCallBuffers.get(index);
		if (!buf) {
			return;
		}
		if (!buf.name) {
			return;
		}
		const canParse = tryParseJSONObject(buf.args);
		if (!canParse.ok) {
			return;
		}
		const id = buf.id ?? `call_${Math.random().toString(36).slice(2, 10)}`;
		const parameters = canParse.value as Record<string, unknown>;
		progress.report(
			new vscode.LanguageModelToolCallPart(id, buf.name, parameters)
		);
		this._toolCallBuffers.delete(index);
		this._completedToolCallIndices.add(index);
	}

	/**
	 * Flush all buffered tool calls, optionally throwing if arguments are not valid JSON.
	 * @param progress Progress reporter for parts.
	 * @param throwOnInvalid If true, throw when a tool call has invalid JSON args.
	 */
	private async flushToolCallBuffers(
		progress: vscode.Progress<vscode.LanguageModelResponsePart>,
		throwOnInvalid: boolean
	): Promise<void> {
		if (this._toolCallBuffers.size === 0) {
			return;
		}
		for (const [idx, buf] of Array.from(this._toolCallBuffers.entries())) {
			const parsed = tryParseJSONObject(buf.args);
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
			const parameters = parsed.value as Record<string, unknown>;
			progress.report(
				new vscode.LanguageModelToolCallPart(id, name, parameters)
			);
			this._toolCallBuffers.delete(idx);
			this._completedToolCallIndices.add(idx);
		}
	}
}
