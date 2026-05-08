/// <reference types="jest" />

import * as vscode from "vscode";
import { shouldShowWelcome, showWelcomePanel } from "../src/welcome";

function createMockContext() {
  const globalState = new Map<string, unknown>();
  const subscriptions: vscode.Disposable[] = [];

  return {
    globalState: {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        globalState.has(key) ? globalState.get(key) : defaultValue
      ),
      update: jest.fn((key: string, value: unknown) => {
        globalState.set(key, value);
        return Promise.resolve();
      }),
      keys: jest.fn(() => Array.from(globalState.keys())),
      setKeysForSync: jest.fn(),
    },
    secrets: {
      get: jest.fn(),
      store: jest.fn(),
      delete: jest.fn(),
      onDidChange: jest.fn(),
    },
    subscriptions,
    extensionUri: {} as vscode.Uri,
    extensionPath: "",
    storageUri: undefined,
    globalStorageUri: {} as vscode.Uri,
    logUri: {} as vscode.Uri,
    extensionMode: vscode.ExtensionMode.Test,
    environmentVariableCollection: {} as any,
    storageState: {
      get: jest.fn(),
      update: jest.fn(),
      keys: jest.fn(() => []),
    },
    asAbsolutePath: jest.fn((p: string) => p),
    secretsStorage: {} as any,
  } as unknown as vscode.ExtensionContext;
}

describe("shouldShowWelcome", () => {
  it("should return true when no API key is stored and welcome not shown", async () => {
    const context = createMockContext();
    (context.secrets.get as jest.Mock).mockResolvedValue(undefined);
    (context.globalState.get as jest.Mock).mockReturnValue(false);

    const result = await shouldShowWelcome(context);
    expect(result).toBe(true);
  });

  it("should return false when API key is already stored", async () => {
    const context = createMockContext();
    (context.secrets.get as jest.Mock).mockResolvedValue("existing-key");
    (context.globalState.get as jest.Mock).mockReturnValue(false);

    const result = await shouldShowWelcome(context);
    expect(result).toBe(false);
  });

  it("should return false when welcome was already shown", async () => {
    const context = createMockContext();
    (context.secrets.get as jest.Mock).mockResolvedValue(undefined);
    (context.globalState.get as jest.Mock).mockReturnValue(true);

    const result = await shouldShowWelcome(context);
    expect(result).toBe(false);
  });

  it("should return false when both API key exists and welcome was shown", async () => {
    const context = createMockContext();
    (context.secrets.get as jest.Mock).mockResolvedValue("existing-key");
    (context.globalState.get as jest.Mock).mockReturnValue(true);

    const result = await shouldShowWelcome(context);
    expect(result).toBe(false);
  });
});

describe("showWelcomePanel", () => {
  it("should create a webview panel with correct options", () => {
    const context = createMockContext();
    const mockWebview = {
      html: "",
      onDidReceiveMessage: jest.fn(),
    };
    const mockPanel = {
      webview: mockWebview,
      dispose: jest.fn(),
    };
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

    showWelcomePanel(context, "1.0.0");

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      "zaiWelcome",
      "Welcome to Z.ai Chat Provider",
      vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [] }
    );
    expect(mockWebview.html).toContain("Welcome to Z.ai Chat Provider");
    expect(mockWebview.html).toContain("v1.0.0");
    expect(mockWebview.html).toContain("Content-Security-Policy");
  });

  it("should register a message handler for setApiKey command", () => {
    const context = createMockContext();
    const mockWebview = {
      html: "",
      onDidReceiveMessage: jest.fn(),
    };
    const mockPanel = {
      webview: mockWebview,
      dispose: jest.fn(),
    };
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

    showWelcomePanel(context, "1.0.0");

    expect(mockWebview.onDidReceiveMessage).toHaveBeenCalledWith(
      expect.any(Function),
      undefined,
      context.subscriptions
    );
  });

  it("should mark welcome as shown in globalState", () => {
    const context = createMockContext();
    const mockWebview = {
      html: "",
      onDidReceiveMessage: jest.fn(),
    };
    const mockPanel = {
      webview: mockWebview,
      dispose: jest.fn(),
    };
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

    showWelcomePanel(context, "1.0.0");

    expect(context.globalState.update).toHaveBeenCalledWith(
      "zai.welcomeShown",
      true
    );
  });

  it("should call zai.manage and dispose panel when setApiKey is received", async () => {
    const context = createMockContext();
    const mockWebview = {
      html: "",
      onDidReceiveMessage: jest.fn(),
    };
    const mockPanel = {
      webview: mockWebview,
      dispose: jest.fn(),
    };
    (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

    showWelcomePanel(context, "1.0.0");

    // Get the message handler that was registered
    const messageHandler = mockWebview.onDidReceiveMessage.mock.calls[0][0];

    await messageHandler({ command: "setApiKey" });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith("zai.manage");
    expect(mockPanel.dispose).toHaveBeenCalled();
  });
});
