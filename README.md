# Z.ai Chat Provider for VS Code

[![CI](https://github.com/Ryosuke-Asano/zai-provider-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/Ryosuke-Asano/zai-provider-extension/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/zai-vscode-chat.svg)](https://www.npmjs.com/package/zai-vscode-chat)

A Visual Studio Code extension that integrates [Z.ai](https://z.ai) models (GLM-4.7, GLM-4.7 Flash) into GitHub Copilot Chat using the Language Model Chat Provider API.

## Features

- **Multiple Model Support**: Access to Z.ai's latest GLM models
  - **GLM-4.7**: High-performance text model (200K context)
  - **GLM-4.7 Flash**: Fast, cost-effective model (200K context)

- **Tool Calling**: Full support for function calling and external tools
- **Streaming Responses**: Real-time response streaming for better UX
- **Vision Support**: Image analysis capabilities for all models (via GLM-OCR API)
- **Thinking Process Display**: View model's reasoning in collapsible sections (GLM-4.7 / GLM-4.7 Flash)
- **Detailed Logging**: Progress indicators for image analysis and reasoning process
- **BYOK (Bring Your Own Key)**: Use your own Z.ai API key
- **Secure API Key Storage**: Uses VS Code's secret storage for your API keys
- **Easy Configuration**: Simple command to manage your Z.ai API key

## Requirements

- Visual Studio Code 1.104.0 or higher
- GitHub Copilot (Free, Pro, or Pro+ plan)
- Z.ai API key (get one at [https://z.ai](https://z.ai))

## Quick Start

1. **Install the Extension**
   - Search for "Z.ai Chat Provider" in the VS Code Extensions Marketplace
   - Or build and install via VSIX:

     ```bash
     # Build the extension
     pnpm run package

     # Install the generated .vsix file
     code --install-extension zai-vscode-chat-*.vsix
     ```

2. **Get Your API Key**
   - Visit [Z.ai](https://z.ai) and sign up for an account
   - Navigate to API settings to generate your API key

3. **Configure the Extension**
   - Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
   - Run: `Z.ai: Manage Z.ai Provider`
   - Enter your Z.ai API key when prompted

4. **Start Chatting**
   - Open GitHub Copilot Chat (`Ctrl+Alt+I` or `Cmd+Alt+I`)
   - Select a Z.ai model from the model selector
   - Start chatting!

## Model Capabilities

| Model             | Context Window | Max Output | Tool Calling | Vision       | Thinking |
| ----------------- | -------------- | ---------- | ------------ | ------------ | -------- |
| **GLM-4.7**       | 200K           | 128K       | ✅           | ✅ (via OCR) | ✅       |
| **GLM-4.7 Flash** | 200K           | 131K       | ✅           | ✅ (via OCR) | ✅       |

## Vision Support

This extension provides vision capabilities for all Z.ai models using the GLM-OCR API:

- **GLM-4.7 / GLM-4.7 Flash**: Image analysis via GLM-OCR API with automatic text conversion

### How It Works

When you send images with Z.ai models, the extension follows a best-effort flow that matches the current implementation:

1. Attempts to extract image bytes from the message parts via the VS Code APIs. If byte data is available the extension converts it to a `data:` URL (`data:<mime>;base64,...`).
2. Sends the image data URL to Z.ai (GLM-OCR / vision endpoint) via the MCP/vision tool or the `glm-4.6v` vision model to perform layout parsing and analysis.
3. Converts the analysis into detailed text descriptions (including structured content like charts, tables, and documents) and adds them to the chat message content.
4. The model responds using the augmented chat context (the original text plus the image descriptions).

Notes:

- If raw image bytes are not available from the editor or input, the extension will fall back to available vision-capable models (for example `glm-4.6v`) or a best-effort OCR path. The extension logs warnings when it cannot obtain image byte data.
- Image data is sent to Z.ai using the user's API key; review your privacy and API usage settings if this is a concern.

### Developer Console Logs

When images are being analyzed, you can see detailed progress logs in the VS Code Developer Tools console:

- 🖼️ Starting image analysis...
- 📡 Sending request to GLM-OCR API...
- ⏱️ Response received with timing
- ✅ Analysis completed with response length and total time
- ❌ Error information if analysis fails

## Thinking Process Display

For GLM-4.7 and GLM-4.7 Flash models, you can now see the model's reasoning process displayed in a collapsible section:

```
<details open>
  <summary>🧠 Thinking Process</summary>

  (Model's step-by-step reasoning shown here)

</details>

(The final answer)
```

### Developer Console Logs

When reasoning is in progress, you can see detailed progress logs:

- 🚀 Starting chat request with thinking enabled
- 🧠 Starting reasoning/thinking process...
- 📦 Emitting reasoning content with length

### Configuration

You can configure the thinking display behavior in VS Code settings:

- **`zai.enableThinking`** (default: `true`)
  - When `true`: Shows the model's thinking/reasoning process in a collapsible section
  - When `false`: Hides the thinking process, showing only the final answer

To change this setting:

1. Open VS Code Settings (`Cmd+,` or `Ctrl+,`)
2. Search for "zai.enableThinking"
3. Toggle the setting on or off

## Development

```bash
# Clone the repository
git clone https://github.com/Ryosuke-Asano/zai-provider-extension.git
cd zai-provider-extension

# Install dependencies
pnpm install

# Compile TypeScript
pnpm run compile

# Watch for changes
pnpm run watch

# Run in VS Code Extension Development Host
# Press F5 in VS Code
```

## Project Structure

```
zai-provider-extension/
├── src/
│   ├── extension.ts      # Extension entry point
│   ├── mcp.ts            # MCP client (vision/OCR)
│   ├── provider.ts       # LanguageModelChatProvider implementation
│   ├── utils.ts          # Utility functions
│   └── types.ts          # Type definitions
├── tests/
│   ├── mcp.test.ts       # MCP client tests
│   ├── types.test.ts     # Type definitions tests
│   └── utils.test.ts     # Utility function tests
├── scripts/
│   └── make-icon.js      # Icon generation script
├── __mocks__/
│   └── vscode.ts         # VS Code API mocks
├── package.json          # Extension manifest
├── tsconfig.json         # TypeScript configuration
├── tsconfig.test.json    # Test TypeScript configuration
├── jest.config.js        # Jest test configuration
├── eslint.config.mjs     # ESLint configuration
├── .prettierrc           # Prettier configuration
└── README.md
```

## API Configuration

The extension uses the Z.ai Coding Plan API:

- **Endpoint**: `https://api.z.ai/api/coding/paas/v4`
- **Compatible with**: OpenAI API format

## Available Scripts

```bash
# Compile TypeScript
pnpm run compile

# Watch for changes and recompile automatically
pnpm run watch

# Run ESLint
pnpm run lint

# Run ESLint with auto-fix
pnpm run lint:fix

# Format code with Prettier
pnpm run format

# Check code formatting
pnpm run format:check

# Run tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage report
pnpm run test:coverage

# Package the extension
pnpm run package

# Publish the extension
pnpm run publish
```

## Getting a Z.ai API Key

1. Visit [https://z.ai](https://z.ai)
2. Sign up or log in to your account
3. Navigate to the API section
4. Generate a new API key
5. Use the key in this extension via the `Z.ai: Manage Z.ai Provider` command

## Troubleshooting

### "Z.ai API key not found"

- Run the `Z.ai: Manage Z.ai Provider` command to enter your API key

### "Message exceeds token limit"

- Reduce the length of your message or conversation history
- Large tool outputs or attachments can inflate the prompt; retry with fewer/shorter tool results
- Try a model with a larger context window

### Models not appearing in Copilot Chat

- Ensure you have VS Code 1.104.0 or higher installed
- Verify that GitHub Copilot is enabled and you're logged in
- Check that the extension is activated (no errors in the dev tools console)

### Vision & GLM-4.6V fallback

- The extension uses an internal `GLM-4.6v` model for native vision support as a fallback; it is not exposed in the model selector.
- Due to VS Code API limitations, image data is not accessible to extensions
- VS Code provides only ephemeral references to images, not the actual image bytes
- This is a platform limitation that affects all Language Model Chat Provider extensions
- Vote for [VS Code issue](https://github.com/microsoft/vscode/issues) to request image data access for extensions

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues, questions, or suggestions:

- Open an issue on GitHub
- Check the [Z.ai documentation](https://docs.z.ai)

## Acknowledgments

- Built with [VSCode Language Model Chat Provider API](https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider)
- Inspired by [Hugging Face Provider for GitHub Copilot Chat](https://github.com/huggingface/huggingface-vscode-chat)

**VISION**

Z.ai Chat Provider は、Z.ai の最新 GLM 系モデルを GitHub Copilot Chat に統合し、開発者が高性能な大規模言語モデルとシームレスにやり取りできるようにすることを目指します。現状の実装では以下を重視しています。

- **実用的なモデル統合**: GLM-4.7 系（GLM-4.7 / GLM-4.7 Flash）を優先サポートし、長いコンテキスト（200K）やストリーミング応答、関数呼び出しを活用した実務的なワークフローを提供します。
- **画像（Vision）対応**: GLM-OCR ベースのレイアウト解析を介して画像入力をテキスト化し、チャット内で画像内容を扱えるようにします。プラットフォーム制約により一部はサーバー経由で処理されますが、ユーザー体験を損なわないよう進捗表示とエラーハンドリングを実装しています。
- **開発者向け設計**: API キーの安全な保管、設定の使いやすさ、詳細なログ出力とテストカバレッジを備え、拡張・デバッグしやすいコード構造を維持します。
- **現実的な制約の明示**: VS Code の拡張 API の制約（画像バイナリへの直接アクセスが制限される等）を踏まえ、フォールバック動作や開発者向けの注意点をドキュメント化しています。

今後の方向性としては、より広いモデル選択肢の提供、ローカルまたはよりプライベートな処理オプションの追求、そしてユーザーからのフィードバックに応じた UX 改善を計画しています。
