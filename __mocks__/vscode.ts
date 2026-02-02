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

  static json(value: any, mime?: string): LanguageModelDataPart {
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
  constructor(public readonly value: unknown) {}
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
      | unknown
    >
  ) {}
}

export type LanguageModelInputPart =
  | LanguageModelTextPart
  | LanguageModelToolResultPart
  | LanguageModelToolCallPart
  | LanguageModelDataPart;

export class LanguageModelChatMessage {
  role: LanguageModelChatMessageRole;
  content: Array<string | LanguageModelInputPart>;
  name: string | undefined;

  constructor(
    role: LanguageModelChatMessageRole,
    content: string | Array<string | LanguageModelInputPart>,
    name?: string
  ) {
    this.role = role;
    this.content =
      typeof content === "string"
        ? [new LanguageModelTextPart(content)]
        : content;
    this.name = name;
  }

  static User(
    content: string | string[] | LanguageModelInputPart[],
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
    toolCalling?: boolean;
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
}

export interface LanguageModelTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// Simplified Event type for testing
export interface Event<T> {
  listener: (e: T) => void;
}

export interface CancellationToken {
  isCancellationRequested: boolean;
  readonly onCancellationRequested: Event<unknown>;
}

export interface Progress<T> {
  report(part: T): void;
}

export interface LanguageModelResponsePart {
  type: "text" | "tool_call" | "tool_result" | "image";
  value: string;
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
  getConfiguration: jest.fn(),
};

export const extensions = {
  getExtension: jest.fn(),
};

export const version = "1.104.0";
