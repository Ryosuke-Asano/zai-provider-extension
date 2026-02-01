# Z.ai Chat Provider for VS Code

A Visual Studio Code extension that integrates [Z.ai](https://z.ai) models (GLM-4.7, GLM-4.7 Flash, GLM-4.6V) into GitHub Copilot Chat using the Language Model Chat Provider API.

## Features

- **Multiple Model Support**: Access to Z.ai's latest GLM models
  - **GLM-4.7**: High-performance text model (128K context)
  - **GLM-4.7 Flash**: Fast, cost-effective model (128K context)
  - **GLM-4.6V**: Vision-capable model (128K context)

- **Tool Calling**: Full support for function calling and external tools
- **Streaming Responses**: Real-time response streaming for better UX
- **Vision Support**: Image analysis capabilities for all models (native for GLM-4.6V, via Vision API for others)
- **Thinking Process Display**: View model's reasoning in collapsible sections (GLM-4.5/4.6/4.7)
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
   - Or install via VSIX: `code --install-extension zai-vscode-chat-*.vsix`

2. **Get Your API Key**
   - Visit [Z.ai](https://z.ai) and sign up for an account
   - Navigate to API settings to generate your API key

3. **Configure the Extension**
   - Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
   - Run: `Z.ai: Manage API Key`
   - Enter your Z.ai API key when prompted

4. **Start Chatting**
   - Open GitHub Copilot Chat (`Ctrl+Alt+I` or `Cmd+Alt+I`)
   - Select a Z.ai model from the model selector
   - Start chatting!

## Model Capabilities

| Model             | Context Window | Max Output | Tool Calling | Vision | Thinking |
| ----------------- | -------------- | ---------- | ------------ | ------ | -------- |
| **GLM-4.7**       | 128K           | 16K        | ✅           | ✅     | ✅       |
| **GLM-4.7 Flash** | 128K           | 16K        | ✅           | ✅     | ✅       |
| **GLM-4.6V**      | 128K           | 16K        | ✅           | ✅     | ✅       |

## Vision Support

This extension now provides vision capabilities for all Z.ai models:

- **GLM-4.6V**: Native vision support via LanguageModelDataPart
- **GLM-4.7 / GLM-4.7 Flash**: Image analysis via Vision API with automatic text conversion

### How It Works

1. **Native Vision (GLM-4.6V)**: When you send images with GLM-4.6V, the model directly analyzes them and includes visual context in its response.

2. **Non-Vision Models**: When you send images with text-only models (GLM-4.7, GLM-4.7 Flash), the extension:
   - Analyzes images using the Vision API
   - Converts the analysis to detailed text descriptions
   - Includes these descriptions in the chat context
   - The model then responds based on the image descriptions

### Developer Console Logs

When images are being analyzed, you can see detailed progress logs in the VS Code Developer Tools console:

- 🖼️ Starting image analysis...
- 📡 Sending request to Vision API...
- ⏱️ Response received with timing
- ✅ Analysis completed with response length and total time
- ❌ Error information if analysis fails

## Thinking Process Display

For GLM-4.5, GLM-4.6, and GLM-4.7 models, you can now see the model's reasoning process displayed in a collapsible section:

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
git clone <repository-url>
cd zai-provider-extension

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Run in VS Code Extension Development Host
# Press F5 in VS Code
```

## Project Structure

```
zai-provider-extension/
├── src/
│   ├── extension.ts      # Extension entry point
│   ├── provider.ts       # LanguageModelChatProvider implementation
│   ├── utils.ts          # Utility functions
│   └── types.ts          # Type definitions
├── package.json          # Extension manifest
├── tsconfig.json         # TypeScript configuration
└── README.md
```

## API Configuration

The extension uses the Z.ai Coding Plan API:

- **Endpoint**: `https://api.z.ai/api/coding/paas/v4`
- **Compatible with**: OpenAI API format

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
- Try a model with a larger context window

### Models not appearing in Copilot Chat

- Ensure you have VS Code 1.104.0 or higher installed
- Verify that GitHub Copilot is enabled and you're logged in
- Check that the extension is activated (no errors in the dev tools console)

### Images not being processed by GLM-4.6V

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
