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
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
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
   * For example, `glm-5v-turbo` may be kept for internal vision fallback.
   */
  internal?: boolean;
  /**
   * When true, the model supports the `reasoning_effort` parameter
   * (takes effect when `thinking` is enabled). Currently GLM-5.2 only.
   */
  supportsReasoningEffort?: boolean;
}

/**
 * Reasoning effort levels supported by GLM-5.2.
 * Takes effect when `thinking` is enabled. Default is `max`.
 * - `none` / `minimal`: model skips thinking
 * - `low` / `medium`: mapped to `high` by the API
 * - `xhigh`: mapped to `max` by the API
 */
export type ZaiReasoningEffort =
  | "max"
  | "xhigh"
  | "high"
  | "medium"
  | "low"
  | "minimal"
  | "none";

/**
 * A strongly-typed request body used for Z.ai Chat API requests
 */
export interface ZaiRequestBody {
  model: string;
  messages: ZaiChatMessage[];
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  max_tokens?: number;
  temperature?: number;
  thinking?: { type: string };
  /** Controls reasoning effort level. Only supported by GLM-5.2. */
  reasoning_effort?: ZaiReasoningEffort;
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
    contextWindow: 131072,
    maxOutput: 98304,
    supportsTools: true,
    supportsVision: false, // Text-only model
  },
  {
    id: "glm-4.5-air",
    name: "GLM-4.5 Air",
    displayName: "GLM-4.5 Air",
    contextWindow: 131072,
    maxOutput: 98304,
    supportsTools: true,
    supportsVision: false, // Text-only model
  },
  {
    id: "glm-4.6",
    name: "GLM-4.6",
    displayName: "GLM-4.6",
    contextWindow: 204800,
    maxOutput: 204800,
    supportsTools: true,
    supportsVision: false, // Text-only model
  },
  {
    id: "glm-4.7",
    name: "GLM-4.7",
    displayName: "GLM-4.7",
    contextWindow: 202752,
    maxOutput: 65535,
    supportsTools: true,
    supportsVision: false, // Text-only model
  },
  {
    id: "glm-4.7-flash",
    name: "GLM-4.7 Flash",
    displayName: "GLM-4.7 Flash",
    contextWindow: 202752,
    maxOutput: 65535,
    supportsTools: true,
    supportsVision: false, // No vision support
  },
  {
    id: "glm-5",
    name: "GLM-5",
    displayName: "GLM-5",
    contextWindow: 202752,
    maxOutput: 131072,
    supportsTools: true,
    supportsVision: false, // Text-only model
  },
  {
    id: "glm-5.1",
    name: "GLM-5.1",
    displayName: "GLM-5.1",
    contextWindow: 202752,
    maxOutput: 131072,
    supportsTools: true,
    supportsVision: false, // Text-only model
  },
  {
    id: "glm-5.2",
    name: "GLM-5.2",
    displayName: "GLM-5.2",
    // 1M-context variant (a.k.a. glm-5.2[1m] on the Anthropic-compatible endpoint);
    // bare id on the OpenAI-compatible coding endpoint carries the 1M window.
    contextWindow: 1000000,
    maxOutput: 131072,
    supportsTools: true,
    supportsVision: false, // Text-only model
    supportsReasoningEffort: true, // Only GLM-5.2 supports reasoning_effort
  },
  {
    id: "glm-5-turbo",
    name: "GLM-5-Turbo",
    displayName: "GLM-5-Turbo",
    contextWindow: 202752,
    maxOutput: 131072,
    supportsTools: true,
    supportsVision: false, // Text-only model
  },
  {
    id: "glm-4.6v",
    name: "GLM-4.6V",
    displayName: "GLM-4.6V",
    contextWindow: 131072,
    maxOutput: 16384,
    supportsTools: true,
    supportsVision: true,
    internal: true, // Internal-only vision fallback, not user-selectable
  },
  {
    id: "glm-5v-turbo",
    name: "GLM-5V-Turbo",
    displayName: "GLM-5V-Turbo",
    contextWindow: 202752,
    maxOutput: 131072,
    supportsTools: true,
    supportsVision: true, // Multimodal coding model
  },
  {
    id: "glm-5-code",
    name: "GLM-5-Code",
    displayName: "GLM-5-Code",
    contextWindow: 202752,
    maxOutput: 131072,
    supportsTools: true,
    supportsVision: false, // Text-only model
  },
];
