# Z.ai Chat Provider for VS Code

A Visual Studio Code extension that integrates [Z.ai](https://z.ai) models (GLM-4.7, GLM-4.7 Flash, GLM-4.6V) into GitHub Copilot Chat using the Language Model Chat Provider API.

## Features

- **Multiple Model Support**: Access to Z.ai's latest GLM models
  - **GLM-4.7**: High-performance text model (128K context)
  - **GLM-4.7 Flash**: Fast, cost-effective model with native vision support (128K context)
  - **GLM-4.6V**: Specialized vision model for image analysis (128K context)

- **Tool Calling**: Full support for function calling and external tools
- **Streaming Responses**: Real-time response streaming for better UX
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

| Model             | Context Window | Max Output | Tool Calling | Vision |
| ----------------- | -------------- | ---------- | ------------ | ------ |
| **GLM-4.7**       | 128K           | 16K        | ✅           | ❌     |
| **GLM-4.7 Flash** | 128K           | 16K        | ✅           | ❌     |
| **GLM-4.6V**      | 128K           | 16K        | ✅           | ✅     |

**Note**: Vision support is only available for GLM-4.6V model. GLM-4.7 and GLM-4.7 Flash do not support image input.

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
