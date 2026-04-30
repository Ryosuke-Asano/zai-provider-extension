import * as vscode from "vscode";

/**
 * Show a welcome/getting-started webview panel with setup instructions.
 * Only shown when no API key is configured (first install).
 */
export function showWelcomePanel(
  context: vscode.ExtensionContext,
  extVersion: string
): void {
  const panel = vscode.window.createWebviewPanel(
    "zaiWelcome",
    "Welcome to Z.ai Chat Provider",
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = getWelcomeHtml(extVersion);

  // Handle the "Set API Key" button click
  panel.webview.onDidReceiveMessage(
    async (message: { command: string }) => {
      if (message.command === "setApiKey") {
        await vscode.commands.executeCommand("zai.manage");
        // Close the welcome panel after opening the key prompt
        panel.dispose();
      }
    },
    undefined,
    context.subscriptions
  );

  // Mark that we've shown the welcome page so we don't show it again
  context.globalState.update("zai.welcomeShown", true);
}

/**
 * Check whether we should show the welcome panel (first install, no key).
 */
export async function shouldShowWelcome(
  context: vscode.ExtensionContext
): Promise<boolean> {
  const apiKey = await context.secrets.get("zai.apiKey");
  const alreadyShown = context.globalState.get<boolean>(
    "zai.welcomeShown",
    false
  );
  return !apiKey && !alreadyShown;
}

function getWelcomeHtml(extVersion: string): string {
  return /*html*/ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Z.ai Chat Provider</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --accent: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --accent-fg: var(--vscode-button-foreground);
      --code-bg: var(--vscode-textCodeBlock-background);
      --link: var(--vscode-textLink-foreground);
      --border: var(--vscode-widget-border);
    }
    body {
      font-family: var(--vscode-font-family);
      color: var(--fg);
      background: var(--bg);
      max-width: 720px;
      margin: 40px auto;
      padding: 0 24px;
      line-height: 1.6;
    }
    h1 {
      font-size: 1.8em;
      margin-bottom: 0.2em;
    }
    .subtitle {
      color: var(--vscode-descriptionForeground);
      margin-bottom: 2em;
    }
    h2 {
      font-size: 1.3em;
      margin-top: 1.8em;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.3em;
    }
    h3 {
      font-size: 1.1em;
      margin-top: 1.4em;
      margin-bottom: 0.4em;
    }
    .step {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
    }
    .step-number {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--accent);
      color: var(--accent-fg);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 0.9em;
    }
    .step-content {
      padding-top: 3px;
    }
    code {
      background: var(--code-bg);
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    .btn {
      display: inline-block;
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      padding: 10px 24px;
      font-size: 1em;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 1.2em;
      text-decoration: none;
    }
    .btn:hover {
      background: var(--accent-hover);
    }
    .footer {
      margin-top: 3em;
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
    }
    .badge {
      display: inline-block;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      padding: 0;
      border-radius: 0;
      font-size: 0.5em;
      font-weight: 400;
      vertical-align: middle;
      margin-left: 8px;
    }
  </style>
</head>
<body>

  <h1>Z.ai Chat Provider <span class="badge">v${extVersion}</span></h1>
  <p class="subtitle">Use Z.ai (智谱AI) models in VS Code Copilot Chat</p>

  <p>
    <strong>Prerequisite:</strong>
    <a href="https://code.visualstudio.com/docs/copilot/setup">Set up Copilot</a>
    to use AI features in VS Code before proceeding.
  </p>

  <h2>Setup — Set Your API Key</h2>

  <p>Choose one of the following ways to configure your API key:</p>

  <h3>Option A: Quick Setup</h3>
  <p>Click the button below to enter your API key right away:</p>
  <button class="btn" id="setApiKeyBtn">Set API Key Now</button>

  <h3>Option B: Via Command Palette</h3>

  <div class="step">
    <div class="step-number">1</div>
    <div class="step-content">Open Command Palette (<code>Cmd/Ctrl + Shift + P</code>)</div>
  </div>
  <div class="step">
    <div class="step-number">2</div>
    <div class="step-content">Run <code>Z.ai: Manage Z.ai Provider</code></div>
  </div>
  <div class="step">
    <div class="step-number">3</div>
    <div class="step-content">Enter your Z.ai API key</div>
  </div>

  <p>
    Get your API key from
    <a href="https://open.bigmodel.cn/">Z.ai Platform</a>.
  </p>

  <h2>After Setup</h2>
  <ol>
    <li>Open the Chat view (<code>Cmd/Ctrl + Alt + I</code>)</li>
    <li>Click the Pick Model button (<code>Cmd/Ctrl + Alt + .</code>)</li>
    <li>Open <strong>Manage Language Models</strong> menu (⚙️)</li>
    <li>Click Z.ai models under <strong>Z.ai</strong> category to "Show in the chat model picker"</li>
    <li>Choose a model (GLM-4.5, GLM-4.6, GLM-4.7, GLM-5, GLM-5.1, GLM-5-Turbo, GLM-5V-Turbo, or GLM-5-Code)</li>
  </ol>

  <div class="footer">
    <p>
      <a href="https://github.com/Ryosuke-Asano/zai-provider-extension">GitHub</a> ·
      <a href="https://z.ai">Z.ai</a> ·
      <a href="https://open.bigmodel.cn/">Z.ai Platform</a>
    </p>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('setApiKeyBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'setApiKey' });
    });
  </script>
</body>
</html>`;
}
