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
			(part) => (part as any).type === "image" || part.constructor.name === "LanguageModelImagePart"
		) as any[];

		// Extract content from message parts - check for 'value' property instead of type
		const textParts = msg.content.filter(
			(part) => (part as any).value !== undefined
		) as any[];

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

				// Try to get image bytes from different properties
				let imageData: Uint8Array | undefined;

				if (imgPart.bytes) {
					imageData = imgPart.bytes;
				} else if ((imgPart as any).data) {
					imageData = (imgPart as any).data;
				} else if ((imgPart as any).buffer) {
					imageData = new Uint8Array((imgPart as any).buffer);
				}

				if (imageData && imageData.length > 0) {
					const base64Data = Buffer.from(imageData).toString("base64");
					contentParts.push({
						type: "image_url",
						image_url: {
							url: `data:${mimeType};base64,${base64Data}`,
						},
					});
				} else {
					// No actual image data available - this is expected with VSCode's ephemeral references
					// We'll skip this image since we can't access the actual file
					console.warn("[Z.ai] Image part has no accessible byte data:", imgPart);
				}
			}

			// Only use content array format if we have valid images
			if (contentParts.length > 1) { // 1 because we always have text
				zaiMsg.content = contentParts;
			} else {
				// No valid images, fall back to text-only
				const textContent = textParts.map((part) => part.value).join("");
				zaiMsg.content = textContent || "(empty message)";
			}
		} else {
			// Simple text-only message
			const textContent = textParts.map((part) => part.value).join("");
			// Ensure content is never empty - Z.ai API rejects empty content
			zaiMsg.content = textContent || "(empty message)";
		}

		// Handle tool calls if present
		const toolCallParts = msg.content.filter(
			(part) => (part as any).type === "tool_call" || part.constructor.name === "LanguageModelToolCallPart" || part.constructor.name === "$a"
		) as any[];

		if (toolCallParts.length > 0) {
			zaiMsg.tool_calls = toolCallParts.map((tc: any) => ({
				id: tc.callId,
				type: "function",
				function: {
					name: tc.name,
					arguments: JSON.stringify(tc.input || tc.arguments),
				},
			}));
		}

		// Handle tool result if present
		const toolResultParts = msg.content.filter(
			(part) => (part as any).type === "tool_result" || part.constructor.name === "LanguageModelToolResultPart" || part.constructor.name === "nl"
		) as any[];

		if (toolResultParts.length > 0) {
			const textContent = textParts.map((part) => part.value).join("");
			const toolResults = toolResultParts.map((tr: any) => {
				// Try different ways to extract the result value
				if (typeof tr.value === "string") {
					return tr.value;
				}
				if (typeof tr.valueOf === "function") {
					const result = tr.valueOf();
					if (typeof result === "string") {
						return result;
					}
					return JSON.stringify(result);
				}
				// Fallback: stringify the whole object
				return JSON.stringify(tr);
			}).join("\n");
			zaiMsg.content = (textContent + "\n" + toolResults).trim();
		}

		// Set tool_call_id for tool result messages
		if ((msg.role as any) === "tool" && toolResultParts.length > 0) {
			zaiMsg.tool_call_id = (toolResultParts[0] as any).callId;
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
			if ((part as any).type === "text") {
				total += estimateTokens((part as any).value);
			} else if ((part as any).type === "image") {
				// Rough estimate: images typically cost ~1000-2000 tokens
				total += 1500;
			}
		}
	}
	return total;
}
