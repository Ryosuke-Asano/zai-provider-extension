/// <reference types="jest" />
/**
 * Mock for VS Code API
 * This provides minimal implementations for testing purposes
 */

export enum LanguageModelChatMessageRole {
  User = 1,
  Assistant = 2,
}

export class LanguageModelTextPart {
  constructor(public readonly value: string) {}
}

import type { Json } from "../src/types";

export class LanguageModelDataPart {
  public readonly mimeType: string;
  public readonly data: Uint8Array;

  constructor(data: Uint8Array, mimeType: string) {
    this.mimeType = mimeType;
    this.data = data;
  }

  static image(data: Uint8Array, mime: string): LanguageModelDataPart {
    return new LanguageModelDataPart(data, mime);
  }

  static json(value: Json, mime?: string): LanguageModelDataPart {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    return new LanguageModelDataPart(data, mime || "application/json");
  }

  static text(value: string, mime?: string): LanguageModelDataPart {
    const encoder = new TextEncoder();
    const data = encoder.encode(value);
    return new LanguageModelDataPart(data, mime || "text/plain");
  }
}

export class LanguageModelPromptTsxPart {
  constructor(public readonly value: Json) {}
}

export class LanguageModelToolCallPart {
  constructor(
    public readonly callId: string,
    public readonly name: string,
    public readonly input: object
  ) {}
}

export class LanguageModelToolResultPart {
  constructor(
    public readonly callId: string,
    public readonly content: Array<
      | LanguageModelTextPart
      | LanguageModelPromptTsxPart
      | LanguageModelDataPart
      | Json
    >
  ) {}
}

export enum LanguageModelChatToolMode {
  Auto = 1,
  Required = 2,
}

export type LanguageModelInputPart =
  | LanguageModelTextPart
  | LanguageModelToolResultPart
  | LanguageModelToolCallPart
  | LanguageModelDataPart;

export class LanguageModelChatMessage {
  role: LanguageModelChatMessageRole;
  content: LanguageModelInputPart[];
  name: string | undefined;

  constructor(
    role: LanguageModelChatMessageRole,
    content: string | LanguageModelInputPart[],
    name?: string
  ) {
    this.role = role;
    this.name = name;

    // Always store as LanguageModelInputPart[] to match VSCode API
    // If content is a string, wrap it in a LanguageModelTextPart
    if (typeof content === "string") {
      this.content = [new LanguageModelTextPart(content)];
    } else if (
      Array.isArray(content) &&
      content.length > 0 &&
      typeof content[0] === "string"
    ) {
      // Convert array of strings to array of LanguageModelTextParts
      this.content = (content as unknown as string[]).map(
        (s) => new LanguageModelTextPart(s)
      );
    } else {
      // Array of LanguageModelInputPart or empty array
      this.content = content as LanguageModelInputPart[];
    }
  }

  static User(
    content: string | LanguageModelInputPart[],
    name?: string
  ): LanguageModelChatMessage {
    return new LanguageModelChatMessage(
      LanguageModelChatMessageRole.User,
      content,
      name
    );
  }

  static Assistant(
    content: string | LanguageModelInputPart[],
    name?: string
  ): LanguageModelChatMessage {
    return new LanguageModelChatMessage(
      LanguageModelChatMessageRole.Assistant,
      content,
      name
    );
  }
}

export interface LanguageModelChatInformation {
  id: string;
  name: string;
  tooltip?: string;
  family: string;
  version: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  capabilities: {
    toolCalling?: boolean | number;
    imageInput?: boolean;
  };
}

export interface ProvideLanguageModelChatResponseOptions {
  modelOptions?: {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    stop?: string | string[];
  };
  tools?: readonly LanguageModelTool[];
  toolMode?: LanguageModelChatToolMode;
}

export interface PrepareLanguageModelChatModelOptions {
  silent: boolean;
}

export interface LanguageModelChatProvider<T = LanguageModelChatInformation> {
  provideLanguageModelChatInformation(
    options: PrepareLanguageModelChatModelOptions,
    token: CancellationToken
  ): Promise<T[]> | T[];
}

export interface LanguageModelTool {
  name: string;
  description: string;
  inputSchema: Record<string, Json>;
}

export type LanguageModelChatTool = LanguageModelTool;

export interface Disposable {
  dispose(): void;
}

export type Event<T> = (listener: (e: T) => void) => Disposable;

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];

  readonly event: Event<T> = (listener) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  };

  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

export interface CancellationToken {
  isCancellationRequested: boolean;
  readonly onCancellationRequested: (listener: () => void) => Disposable;
}

export interface Progress<T> {
  report(part: T): void;
}

export type LanguageModelResponsePart =
  | LanguageModelTextPart
  | LanguageModelToolCallPart
  | LanguageModelToolResultPart
  | LanguageModelDataPart;

export class CancellationError extends Error {
  constructor() {
    super("Operation cancelled");
    this.name = "CancellationError";
  }
}

export class LanguageModelError extends Error {
  constructor(
    message?: string,
    public readonly code: string = "LanguageModelError"
  ) {
    super(message);
    this.name = "LanguageModelError";
  }

  static NoPermissions(message?: string): LanguageModelError {
    return new LanguageModelError(message, "NoPermissions");
  }

  static NotFound(message?: string): LanguageModelError {
    return new LanguageModelError(message, "NotFound");
  }

  static Blocked(message?: string): LanguageModelError {
    return new LanguageModelError(message, "Blocked");
  }
}

export class SecretStorage {
  get = jest.fn();
  store = jest.fn();
  delete = jest.fn();
  keys = jest.fn();
  onDidChange = jest.fn();
}

export const secrets = {
  get: jest.fn(),
  store: jest.fn(),
  delete: jest.fn(),
  keys: jest.fn(),
  onDidChange: jest.fn(),
};

export const lm = {
  registerLanguageModelChatProvider: jest.fn(),
};

export const commands = {
  registerCommand: jest.fn(),
};

export const window = {
  showInputBox: jest.fn(),
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
};

export const workspace = {
  getConfiguration: jest.fn((_section?: string) => ({
    get: <T>(_section: string, defaultValue: T): T => defaultValue,
  })),
};

export const extensions = {
  getExtension: jest.fn(),
};

export const version = "1.104.0";
