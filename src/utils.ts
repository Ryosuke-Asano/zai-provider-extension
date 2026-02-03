import * as vscode from "vscode";
import type {
  ZaiChatMessage,
  ZaiTool,
  ZaiContentPart,
  Json,
  JsonObject,
} from "./types";

/**
 * Legacy part shape used by mocks or older API shapes
 */
export interface LegacyPart {
  type?: string;
  mimeType?: string;
  bytes?: Uint8Array | number[];
  data?: Uint8Array | number[];
  buffer?: ArrayBuffer;
  value?: string;
  callId?: string;
  input?: Json | JsonObject | Json[];
  arguments?: string | JsonObject;
  name?: string;
  [key: string]: Json | Uint8Array | number[] | ArrayBuffer | undefined;
}

/**
 * Helper: extract text value from a LanguageModelTextPart or plain object
 */
export function getTextPartValue(
  part: vscode.LanguageModelInputPart | LegacyPart
): string | undefined {
  if (part instanceof vscode.LanguageModelTextPart) {
    return part.value;
  }
  if (typeof part === "object" && part !== null) {
    const p = part as { value?: string };
    if (typeof p.value === "string") {
      return p.value;
    }
  }
  return undefined;
}

/**
 * Helper: extract image bytes and mime type from a variety of part shapes
 */
export function extractImageData(
  part: vscode.LanguageModelInputPart | LegacyPart
): { mimeType: string; data: Uint8Array } | undefined {
  if (part instanceof vscode.LanguageModelDataPart) {
    if (
      typeof part.mimeType === "string" &&
      part.mimeType.startsWith("image/") &&
      part.data &&
      part.data.length > 0
    ) {
      return { mimeType: part.mimeType, data: part.data };
    }
    return undefined;
  }

  if (typeof part !== "object" || part === null) {
    return undefined;
  }

  const p = part as LegacyPart;

  if (p.type === "image") {
    const mimeType = typeof p.mimeType === "string" ? p.mimeType : "image/png";
    if (p.bytes instanceof Uint8Array && p.bytes.length > 0) {
      return { mimeType, data: p.bytes };
    }
    if (p.data instanceof Uint8Array && p.data.length > 0) {
      return { mimeType, data: p.data };
    }
    if (p.buffer instanceof ArrayBuffer && p.buffer.byteLength > 0) {
      return { mimeType, data: new Uint8Array(p.buffer) };
    }
    if (Array.isArray(p.bytes) && p.bytes.length > 0) {
      return { mimeType, data: new Uint8Array(p.bytes) };
    }
    if (Array.isArray(p.data) && p.data.length > 0) {
      return { mimeType, data: new Uint8Array(p.data) };
    }
    return undefined;
  }

  if (typeof p.mimeType === "string" && p.mimeType.startsWith("image/")) {
    const mimeType = p.mimeType;
    if (p.bytes instanceof Uint8Array && p.bytes.length > 0) {
      return { mimeType, data: p.bytes };
    }
    if (p.data instanceof Uint8Array && p.data.length > 0) {
      return { mimeType, data: p.data };
    }
    if (p.buffer instanceof ArrayBuffer && p.buffer.byteLength > 0) {
      return { mimeType, data: new Uint8Array(p.buffer) };
    }
    if (Array.isArray(p.bytes) && p.bytes.length > 0) {
      return { mimeType, data: new Uint8Array(p.bytes) };
    }
    if (Array.isArray(p.data) && p.data.length > 0) {
      return { mimeType, data: new Uint8Array(p.data) };
    }
  }

  return undefined;
}

/**
 * Helper: extract tool call info from a part
 */
export function getToolCallInfo(
  part: vscode.LanguageModelInputPart | LegacyPart
): { id?: string; name?: string; args?: Json | string } | undefined {
  if (part instanceof vscode.LanguageModelToolCallPart) {
    return { id: part.callId, name: part.name, args: part.input as Json };
  }
  if (typeof part === "object" && part !== null) {
    const p = part as LegacyPart;
    if (p.callId || p.name || p.type === "tool_call") {
      return {
        id: p.callId,
        name: p.name,
        args: (p.input ?? p.arguments) as Json | string,
      };
    }
  }
  return undefined;
}

/**
 * Helper: extract tool result textual representation from a part
 */
export function getToolResultTexts(
  part: vscode.LanguageModelInputPart | LegacyPart
): string[] {
  const results: string[] = [];

  if (part instanceof vscode.LanguageModelToolResultPart) {
    for (const inner of part.content) {
      const tv = getTextPartValue(
        inner as vscode.LanguageModelInputPart | LegacyPart
      );
      if (tv !== undefined) {
        results.push(tv);
        continue;
      }
      try {
        if (
          typeof (inner as { valueOf?: () => string | object }).valueOf ===
          "function"
        ) {
          const v = (inner as { valueOf: () => string | object }).valueOf();
          results.push(typeof v === "string" ? v : JSON.stringify(v));
        } else {
          results.push(JSON.stringify(inner));
        }
      } catch {
        results.push(String(inner));
      }
    }
    return results;
  }

  if (typeof part === "object" && part !== null) {
    const p = part as LegacyPart;
    if (typeof p.value === "string") {
      results.push(p.value);
    } else if (
      typeof (p as { valueOf?: () => string | object }).valueOf === "function"
    ) {
      try {
        const v = (p as { valueOf: () => string | object }).valueOf();
        results.push(typeof v === "string" ? v : JSON.stringify(v));
      } catch {
        results.push(JSON.stringify(p));
      }
    } else {
      results.push(JSON.stringify(p));
    }
  }

  return results;
}

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

    // Collect text parts
    const textParts: string[] = [];
    for (const part of msg.content) {
      const tv = getTextPartValue(part);
      if (tv !== undefined) {
        textParts.push(tv);
      }
    }

    // Collect images
    const imageParts: ZaiContentPart[] = [];
    for (const part of msg.content) {
      const img = extractImageData(part);
      if (!img) continue;
      if (img.data && img.data.length > 0) {
        const base64Data = Buffer.from(img.data).toString("base64");
        imageParts.push({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${base64Data}` },
        });
      } else {
        console.warn("[Z.ai] Image part has no accessible byte data:", part);
      }
    }

    if (imageParts.length > 0) {
      const contentParts: ZaiContentPart[] = [];
      const textContent = textParts.join("");
      if (textContent) {
        contentParts.push({ type: "text", text: textContent });
      }
      contentParts.push(...imageParts);
      zaiMsg.content = contentParts;
    } else {
      const textContent = textParts.join("");
      zaiMsg.content = textContent || "(empty message)";
    }

    // Handle tool calls
    const toolCalls = msg.content
      .map((p) => getToolCallInfo(p))
      .filter(
        (t): t is { id?: string; name?: string; args?: Json | string } => !!t
      );

    if (toolCalls.length > 0) {
      zaiMsg.tool_calls = toolCalls.map((tc) => ({
        id: tc.id ?? `call_${Math.random().toString(36).slice(2, 10)}`,
        type: "function",
        function: {
          name: tc.name ?? "unknown",
          arguments: JSON.stringify(tc.args ?? {}),
        },
      }));
    }

    // Handle tool results
    const toolResultTexts = msg.content.flatMap((p) => getToolResultTexts(p));
    if (toolResultTexts.length > 0) {
      const textContent = textParts.join(" ");
      zaiMsg.content = (textContent + "\n" + toolResultTexts.join("\n")).trim();
    }

    // Set tool_call_id for tool result messages (legacy support)
    const firstToolResultCallId = getFirstToolResultCallId(
      msg.content as Array<vscode.LanguageModelInputPart | LegacyPart>
    );
    if (firstToolResultCallId) {
      zaiMsg.tool_call_id = firstToolResultCallId;
    }

    result.push(zaiMsg);
  }

  return result;
}

export function getFirstToolResultCallId(
  parts: Array<vscode.LanguageModelInputPart | LegacyPart>
): string | undefined {
  for (const p of parts) {
    if (p instanceof vscode.LanguageModelToolResultPart) {
      return p.callId;
    }
    if (typeof p === "object" && p !== null) {
      const lp = p as LegacyPart;
      if (typeof lp.callId === "string") {
        return lp.callId;
      }
    }
  }
  return undefined;
}

/**
 * Convert VSCode tools to Z.ai/OpenAI format
 */
export function convertTools(
  options: vscode.ProvideLanguageModelChatResponseOptions
): {
  tools?: ZaiTool[];
  tool_choice?: "auto" | "none" | { type: string; function: { name: string } };
} {
  if (!options.tools || options.tools.length === 0) {
    return {};
  }

  const tools: ZaiTool[] = options.tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as JsonObject,
    },
  }));

  return { tools };
}

/**
 * Parse JSON with error handling (generic)
 */
export function tryParseJSONObject<T extends Json = Json>(
  text: string
): { ok: true; value: T } | { ok: false; error: string } {
  if (!text || !text.trim()) {
    return { ok: false, error: "Empty string" };
  }
  try {
    const value = JSON.parse(text) as T;
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
export function validateRequest(
  messages:
    | readonly vscode.LanguageModelChatMessage[]
    | readonly {
        role: string;
        content: (vscode.LanguageModelInputPart | LegacyPart)[];
      }[]
): void {
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
  const result = Math.ceil(text.length / 4);
  return result;
}

/**
 * Estimate message array tokens
 */
export function estimateMessagesTokens(
  messages:
    | readonly vscode.LanguageModelChatMessage[]
    | readonly {
        content: (vscode.LanguageModelInputPart | LegacyPart)[];
      }[]
): number {
  let total = 0;
  for (const m of messages) {
    for (const part of m.content) {
      const tv = getTextPartValue(part);
      if (tv !== undefined) {
        total += estimateTokens(tv);
        continue;
      }
      const img = extractImageData(part);
      if (img) {
        total += 1500; // Rough estimate
      }
    }
  }
  return total;
}
