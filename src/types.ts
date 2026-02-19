/**
 * Type definitions for Z.ai API compatibility
 * Based on OpenAI-compatible API format
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [k: string]: Json };
export type JsonObject = { [k: string]: Json };

/**
 * Content part for chat messages
 */
export interface ZaiContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface ZaiChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ZaiContentPart[];
  name?: string;
  tool_calls?: ZaiToolCall[];
  tool_call_id?: string;
}

export interface ZaiToolCall {
  id: string;
  /** Optional index used in streaming tool call deltas */
  index?: number;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ZaiTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: JsonObject;
  };
}

export interface ZaiChatRequest {
  model: string;
  messages: ZaiChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  top_p?: number;
  stop?: string | string[];
  tools?: ZaiTool[];
  tool_choice?: "auto" | "none" | { type: string; function: { name: string } };
}

export interface ZaiChatChoice {
  index: number;
  message: {
    role: string;
    content: string | null;
    tool_calls?: ZaiToolCall[];
  };
  finish_reason: string;
}

export interface ZaiChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ZaiChatChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ZaiStreamChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
    reasoning_content?: string;
    tool_calls?: ZaiToolCall[];
  };
  finish_reason: string | null;
}

export interface ZaiStreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ZaiStreamChoice[];
}

/**
 * Model information for Z.ai models
 */
export interface ZaiModelInfo {
  id: string;
  name: string;
  displayName: string;
  contextWindow: number;
  maxOutput: number;
  supportsTools: boolean;
  supportsVision: boolean;
  /**
   * When true, the model is internal-only and should not be exposed to users.
   * For example, `glm-4.6v` may be kept for internal vision fallback.
   */
  internal?: boolean;
}

/**
 * A strongly-typed request body used for Z.ai Chat API requests
 */
export interface ZaiRequestBody {
  model: string;
  messages: ZaiChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  thinking?: { type: string };
  stop?: string | string[];
  frequency_penalty?: number;
  presence_penalty?: number;
  tools?: ZaiTool[];
  tool_choice?: "auto" | "none" | { type: string; function: { name: string } };
}

/**
 * Available Z.ai models configuration
 */
export const ZAI_MODELS: ZaiModelInfo[] = [
  {
    id: "glm-4.5",
    name: "GLM-4.5",
    displayName: "GLM-4.5",
    contextWindow: 131000,
    maxOutput: 98000,
    supportsTools: true,
    supportsVision: false, // Text-only model
  },
  {
    id: "glm-4.5-air",
    name: "GLM-4.5 Air",
    displayName: "GLM-4.5 Air",
    contextWindow: 131000,
    maxOutput: 98000,
    supportsTools: true,
    supportsVision: false, // Text-only model
  },
  {
    id: "glm-4.6",
    name: "GLM-4.6",
    displayName: "GLM-4.6",
    contextWindow: 200000,
    maxOutput: 131000,
    supportsTools: true,
    supportsVision: false, // Text-only model
  },
  {
    id: "glm-4.7",
    name: "GLM-4.7",
    displayName: "GLM-4.7",
    contextWindow: 200000,
    maxOutput: 131000,
    supportsTools: true,
    supportsVision: false, // Text-only model
  },
  {
    id: "glm-4.7-flash",
    name: "GLM-4.7 Flash",
    displayName: "GLM-4.7 Flash",
    contextWindow: 200000,
    maxOutput: 131000,
    supportsTools: true,
    supportsVision: false, // No vision support
  },
  {
    id: "glm-5",
    name: "GLM-5",
    displayName: "GLM-5",
    contextWindow: 200000,
    maxOutput: 131000,
    supportsTools: true,
    supportsVision: false, // Text-only model
  },
  {
    id: "glm-5-code",
    name: "GLM-5-Code",
    displayName: "GLM-5-Code",
    contextWindow: 200000,
    maxOutput: 131000,
    supportsTools: true,
    supportsVision: false, // Text-only model
  },
];
