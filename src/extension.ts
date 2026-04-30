import * as vscode from "vscode";
import packageJson from "../package.json";
import { ZaiChatModelProvider } from "./provider";
import { registerZaiTools } from "./tools";
import { shouldShowWelcome, showWelcomePanel } from "./welcome";

// Global provider reference for API key management
let _provider: ZaiChatModelProvider | null = null;

export function activate(context: vscode.ExtensionContext) {
  // Build a descriptive User-Agent to help quantify API usage
  const extVersion = (packageJson as { version?: string }).version ?? "unknown";
  const vscodeVersion = vscode.version;
  // Keep UA minimal: only extension version and VS Code version
  const ua = `zai-vscode-chat/${extVersion} VSCode/${vscodeVersion}`;

  const provider = new ZaiChatModelProvider(context.secrets, ua);
  _provider = provider;

  // Refresh model list when API key is changed outside the management command.
  context.subscriptions.push(
    context.secrets.onDidChange((e) => {
      if (e.key === "zai.apiKey") {
        _provider?.fireModelInfoChanged();
      }
    })
  );

  // Register the Z.ai provider under the vendor id used in package.json
  const registration = vscode.lm.registerLanguageModelChatProvider(
    "zai",
    provider
  );
  context.subscriptions.push(registration);

  console.log("[Z.ai Provider] Z.ai provider registered successfully");

  // Register Z.ai tools (vision analysis, etc.) for Copilot to use
  const toolsRegistration = registerZaiTools(context.secrets);
  context.subscriptions.push(toolsRegistration);

  console.log("[Z.ai Provider] Z.ai tools registered successfully");

  // Management command to configure API key
  context.subscriptions.push(
    vscode.commands.registerCommand("zai.manage", async () => {
      const existing = await context.secrets.get("zai.apiKey");
      const apiKey = await vscode.window.showInputBox({
        title: "Z.ai API Key",
        prompt: existing
          ? "Update your Z.ai API key"
          : "Enter your Z.ai API key",
        ignoreFocusOut: true,
        password: true,
        value: existing ?? "",
        placeHolder: "Enter your Z.ai API key...",
      });
      if (apiKey === undefined) {
        return; // user canceled
      }
      if (!apiKey.trim()) {
        await context.secrets.delete("zai.apiKey");
        vscode.window.showInformationMessage("Z.ai API key cleared.");
        _provider?.fireModelInfoChanged();
        return;
      }
      await context.secrets.store("zai.apiKey", apiKey.trim());
      vscode.window.showInformationMessage("Z.ai API key saved.");
      // Notify VS Code that the list of available models has changed
      _provider?.fireModelInfoChanged();
    })
  );

  console.log("[Z.ai Provider] Extension activated");

  // Show welcome page on first install (when no API key is stored)
  shouldShowWelcome(context).then((show) => {
    if (show) {
      showWelcomePanel(context, extVersion);
    }
  });

  // Command to manually reopen the welcome page
  context.subscriptions.push(
    vscode.commands.registerCommand("zai.welcome", () => {
      showWelcomePanel(context, extVersion);
    })
  );
}

export function deactivate() {
  console.log("[Z.ai Provider] Extension deactivated");
  _provider = null;
}
