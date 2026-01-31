# Z.ai Provider for GitHub Copilot Chat

A Visual Studio Code extension that integrates [Z.ai](https://z.ai) models into GitHub Copilot Chat, enabling you to use powerful GLM models directly in VS Code.

## Features

- **Multiple Z.ai Models**: Support for GLM-4.7, GLM-4.6, GLM-4.6 Vision, and more
- **Universal Vision Support**: All models can analyze images - GLM-4.6 Vision has native support, while GLM-4.7 and others use MCP
- **MCP-Powered Vision**: Non-Vision models (GLM-4.7, GLM-4.6) automatically use Vision MCP to analyze images
- **Built-in MCP Tools**: Web Search, Web Reader, GitHub repository tools
- **Tool Calling**: Full support for function/tool calling capabilities
- **Streaming Responses**: Real-time streaming of chat responses
- **Secure API Key Storage**: Uses VS Code's secret storage for your API keys
- **Easy Configuration**: Simple command to manage your Z.ai API key

## Requirements

- Visual Studio Code 1.104.0 or higher
- GitHub Copilot (Free, Pro, or Pro+ plan)
- Z.ai API key (get one at [https://z.ai](https://z.ai))

## Quick Start

1. **Install the Extension**
   - Search for "Z.ai Provider" in the VS Code Extensions Marketplace
   - Or install from the marketplace (coming soon)

2. **Configure Your API Key**
   - Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
   - Run `Z.ai: Manage Z.ai Provider`
   - Enter your Z.ai API key

3. **Use in Copilot Chat**
   - Open the Copilot Chat panel
   - Click the model picker (dropdown in the chat input)
   - Click "Manage Models..."
   - Select "Z.ai" as the provider
   - Choose your preferred Z.ai model

## Available Models

| Model | Context Window | Max Output | Tool Calling | Vision |
|-------|----------------|------------|--------------|--------|
| GLM-4.7 | 128K | 16K | ✅ | ❌ |
| GLM-4.6 | 128K | 16K | ✅ | ❌ |
| **GLM-4.6 Vision** | 128K | 16K | ✅ | **✅** |
| GLM-4 Plus | 128K | 16K | ✅ | ❌ |
| GLM-4 Air | 128K | 12K | ✅ | ❌ |
| GLM-4 Flash | 128K | 8K | ✅ | ❌ |

## Built-in MCP Tools

The extension includes support for Z.ai's built-in MCP (Model Context Protocol) tools:

### 🌐 Web Search Prime
Search the web for current information with recency filtering.

### 📄 Web Reader
Read and convert web pages to text/markdown format.

### 📚 ZRead (GitHub Repository Reader)
- Read repository files
- Get repository structure
- Search documentation

These tools are automatically available when using Z.ai models with tool calling enabled.

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

The extension uses the Z.ai API endpoints:
- **Base URL**: `https://api.z.ai/api/paas/v4/`
- **Chat Completions**: `/chat/completions`

The Z.ai API is OpenAI-compatible, making it easy to integrate with existing tooling.

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
