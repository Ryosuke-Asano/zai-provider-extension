import * as vscode from "vscode";
import type { ZaiChatMessage, ZaiTool, ZaiContentPart } from "./types";

/**
 * Convert VSCode LanguageModelChatMessage to Z.ai/OpenAI format
 */
export function convertMessages(
	messages: readonly vscode.LanguageModelChatMessage[]
): ZaiChatMessage[] {
	const result: ZaiChatMessage[] = [];

	for (const msg of messages) {
		const zaiMsg: ZaiChatMessage = {
			role:
				msg.role === vscode.LanguageModelChatMessageRole.User
					? "user"
					: msg.role === vscode.LanguageModelChatMessageRole.Assistant
						? "assistant"
						: "system",
			content: "",
		};

		// Check if message contains image parts (for Vision models)
		// LanguageModelImagePart may be available as "image" in content
		const imageParts = msg.content.filter(
			(part) => (part as any).type === "image" || part instanceof (vscode as any).LanguageModelImagePart
		) as any[];

		// Extract content from message parts
		const textParts = msg.content.filter(
			(part) => part instanceof vscode.LanguageModelTextPart
		) as vscode.LanguageModelTextPart[];

		// If we have images, use content array format (for Vision)
		if (imageParts.length > 0) {
			const contentParts: ZaiContentPart[] = [];

			// Add text content
			const textContent = textParts.map((part) => part.value).join("");
			if (textContent) {
				contentParts.push({
					type: "text",
					text: textContent,
				});
			}

			// Add image content
			for (const imgPart of imageParts) {
				// Convert image to base64 data URL
				const mimeType = imgPart.mimeType ?? "image/png";
				const base64Data = Buffer.from(imgPart.bytes).toString("base64");
				contentParts.push({
					type: "image_url",
					image_url: {
						url: `data:${mimeType};base64,${base64Data}`,
					},
				});
			}

			zaiMsg.content = contentParts;
		} else {
			// Simple text-only message
			zaiMsg.content = textParts.map((part) => part.value).join("");
		}

		// Handle tool calls if present
		const toolCallParts = msg.content.filter(
			(part) => part instanceof vscode.LanguageModelToolCallPart
		) as vscode.LanguageModelToolCallPart[];

		if (toolCallParts.length > 0) {
			zaiMsg.tool_calls = toolCallParts.map((tc) => ({
				id: tc.callId,
				type: "function",
				function: {
					name: tc.name,
					arguments: JSON.stringify(tc.input),
				},
			}));
		}

		// Handle tool result if present
		const toolResultParts = msg.content.filter(
			(part) => part instanceof vscode.LanguageModelToolResultPart
		) as vscode.LanguageModelToolResultPart[];

		if (toolResultParts.length > 0) {
			const textContent = textParts.map((part) => part.value).join("");
			const toolResults = toolResultParts.map((tr) => {
				const result = (tr as any).valueOf?.();
				if (typeof result === "string") {
					return result;
				}
				return JSON.stringify(result ?? tr);
			}).join("\n");
			zaiMsg.content = textContent + "\n" + toolResults;
		}

		// Set tool_call_id for tool result messages
		if (msg.role === (vscode.LanguageModelChatMessageRole as any).Tool && toolResultParts.length > 0) {
			zaiMsg.tool_call_id = toolResultParts[0].callId;
		}

		result.push(zaiMsg);
	}

	return result;
}

/**
 * Convert VSCode tools to Z.ai/OpenAI format
 */
export function convertTools(
	options: vscode.ProvideLanguageModelChatResponseOptions
): { tools?: ZaiTool[]; tool_choice?: "auto" | "none" | { type: string; function: { name: string } } } {
	if (!options.tools || options.tools.length === 0) {
		return {};
	}

	const tools: ZaiTool[] = options.tools.map((tool) => ({
		type: "function",
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.inputSchema as Record<string, unknown>,
		},
	}));

	return { tools };
}

/**
 * Parse JSON with error handling
 */
export function tryParseJSONObject(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
	try {
		const value = JSON.parse(text);
		return { ok: true, value };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/**
 * Validate chat request
 */
export function validateRequest(messages: readonly vscode.LanguageModelChatMessage[]): void {
	if (!messages || messages.length === 0) {
		throw new Error("Messages array is empty");
	}

	for (const msg of messages) {
		if (!msg.content || msg.content.length === 0) {
			throw new Error("Message has no content");
		}
	}
}

/**
 * Estimate token count (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/**
 * Estimate message array tokens
 */
export function estimateMessagesTokens(
	messages: readonly vscode.LanguageModelChatMessage[]
): number {
	let total = 0;
	for (const m of messages) {
		for (const part of m.content) {
			if (part instanceof vscode.LanguageModelTextPart) {
				total += estimateTokens(part.value);
			} else if ((part as any).type === "image") {
				// Rough estimate: images typically cost ~1000-2000 tokens
				total += 1500;
			}
		}
	}
	return total;
}
