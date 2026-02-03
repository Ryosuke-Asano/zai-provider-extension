import * as vscode from "vscode";
import packageJson from "../package.json";
import { ZaiChatModelProvider } from "./provider";

export function activate(context: vscode.ExtensionContext) {
  // Build a descriptive User-Agent to help quantify API usage
  const extVersion = (packageJson as { version?: string }).version ?? "unknown";
  const vscodeVersion = vscode.version;
  // Keep UA minimal: only extension version and VS Code version
  const ua = `zai-vscode-chat/${extVersion} VSCode/${vscodeVersion}`;

  const provider = new ZaiChatModelProvider(context.secrets, ua);

  // Register the Z.ai provider under the vendor id used in package.json
  vscode.lm.registerLanguageModelChatProvider("zai", provider);

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
        return;
      }
      await context.secrets.store("zai.apiKey", apiKey.trim());
      vscode.window.showInformationMessage("Z.ai API key saved.");
    })
  );

  console.log("[Z.ai Provider] Extension activated");
}

export function deactivate() {
  console.log("[Z.ai Provider] Extension deactivated");
}
