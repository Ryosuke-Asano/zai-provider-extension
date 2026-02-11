# Z.ai Chat Provider for VS Code

[![CI](https://github.com/Ryosuke-Asano/zai-provider-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/Ryosuke-Asano/zai-provider-extension/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.104.0%2B-blue)](https://code.visualstudio.com/)

Integrates [Z.ai](https://z.ai) (智谱AI) models into VS Code Copilot Chat with advanced features including vision support, tool calling, and thinking process display.

## Features

- **Multiple Model Support**
  - **GLM-4.7**: 200K context window, up to 128K output tokens
  - **GLM-4.7 Flash**: Faster variant with 131K max output tokens
  - **GLM-5**: 200K context window, up to 128K output tokens
  - **GLM-4.6V**: Vision model (internal only, not exposed to users)

- **Advanced Capabilities**
  - Tool calling support for VS Code chat participants
  - Streaming responses via Server-Sent Events (SSE)
  - Vision support via GLM-OCR and GLM-4.6V fallback
  - Thinking/reasoning process display (configurable)
  - Automatic image-to-text conversion for non-vision models

- **Secure API Key Management**
  - Stored securely in VS Code SecretStorage
  - Managed via Command Palette (`Z.ai: Manage Z.ai Provider`)

## Installation

### From Marketplace (Coming Soon)

```bash
code --install-extension Ryosuke-Asano.zai-vscode-chat
```

### From Source

1. Clone the repository:

```bash
git clone https://github.com/Ryosuke-Asano/zai-provider-extension.git
cd zai-provider-extension
```

2. Install dependencies:

```bash
npm install
```

3. Compile the project:

```bash
npm run compile
```

4. Package the extension:

```bash
npm run package
```

5. Install the `.vsix` file:

```bash
code --install-extension zai-vscode-chat-*.vsix
```

## Setup

1. Open VS Code
2. Open Command Palette (`Cmd/Ctrl + Shift + P`)
3. Run `Z.ai: Manage Z.ai Provider`
4. Enter your Z.ai API key

Get your API key from [Z.ai Platform](https://open.bigmodel.cn/).

## Usage

Once configured, select Z.ai as your chat provider in VS Code Copilot Chat:

- Open the Chat view (`Cmd/Ctrl + Alt + I`)
- Click the provider selector
- Choose a Z.ai model (GLM-4.7, GLM-4.7 Flash, or GLM-5)
  - Note: GLM-4.6V is used internally for image processing and is not selectable

### Configuration

| Setting              | Type    | Default | Description                                                 |
| -------------------- | ------- | ------- | ----------------------------------------------------------- |
| `zai.enableThinking` | boolean | `true`  | Enable thinking/reasoning process display in chat responses |

## Supported Models

### User-Selectable Models

| Model         | Context Window | Max Output | Vision | Tools |
| ------------- | -------------- | ---------- | ------ | ----- |
| GLM-4.7       | 200,000        | 131,072    | No     | Yes   |
| GLM-4.7 Flash | 200,000        | 131,072    | No     | Yes   |
| GLM-5         | 200,000        | 131,072    | No     | Yes   |

### Internal Models (Not Exposed)

| Model    | Context Window | Max Output | Vision | Tools | Purpose                                       |
| -------- | -------------- | ---------- | ------ | ----- | --------------------------------------------- |
| GLM-4.6V | 128,000        | 16,000     | Yes    | Yes   | Image analysis fallback for non-vision models |

## MCP Integration

This extension integrates with Z.ai's MCP (Model Context Protocol) servers:

- **web-search-prime**: Web search capabilities
- **web-reader**: URL to text/markdown conversion
- **zread**: GitHub repository file reading
- **vision-mcp**: Image analysis

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guidelines.

### Quick Start

```bash
# Install dependencies
npm install

# Watch for changes
npm run watch

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

### Project Structure

```
src/
├── extension.ts    # Extension entry point, activation
├── provider.ts     # Main chat provider implementation
├── types.ts        # Type definitions and model configuration
├── mcp.ts          # MCP client for tool integration
└── utils.ts        # Utility functions for message/tool conversion
```

## Requirements

- VS Code 1.104.0 or later
- Node.js 20 or later (for development)
- Z.ai API key

## Troubleshooting

### API Key Issues

If you see authentication errors:

1. Run `Z.ai: Manage Z.ai Provider`
2. Verify your API key is correct
3. Ensure your API key has active credits

### Vision Not Working

For non-vision models (GLM-4.7, GLM-4.7 Flash):

- Images are automatically converted to text descriptions using GLM-OCR MCP
- If GLM-OCR fails, the extension internally uses GLM-4.6V for image analysis
- GLM-4.6V is **not selectable** by users—it is only used as an internal fallback

### Large Context Errors

If you encounter token limit errors:

- Reduce the amount of code/context in your message
- The extension enforces model-specific context limits

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

MIT © 2025 Ryosuke Asano

[License](LICENSE)

## Links

- [Repository](https://github.com/Ryosuke-Asano/zai-provider-extension)
- [Issue Tracker](https://github.com/Ryosuke-Asano/zai-provider-extension/issues)
- [Z.ai Platform](https://open.bigmodel.cn/)
