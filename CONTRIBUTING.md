# Contributing to Z.ai Chat Provider for VS Code

Thank you for your interest in contributing to this project! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 20 or later
- Visual Studio Code 1.104.0 or later
- Git

### Setting Up the Development Environment

1. **Fork and Clone the Repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/zai-vscode-chat.git
   cd zai-vscode-chat
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Compile the Project**

   ```bash
   npm run compile
   ```

## Development Workflow

### Making Changes

1. Create a new branch for your feature or bugfix:

   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bugfix-name
   ```

2. Make your changes in the `src/` directory.

3. Watch for changes during development:

   ```bash
   npm run watch
   ```

### Code Quality

Before submitting a pull request, ensure your code passes all checks:

#### 1. Format Your Code

```bash
npm run format
```

#### 2. Run Linter

```bash
npm run lint
```

Auto-fix linting issues (if possible):

```bash
npm run lint:fix
```

#### 3. Run Tests

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

#### 4. Compile TypeScript

```bash
npm run compile
```

### CI/CD Pipeline

This project uses GitHub Actions for continuous integration and continuous deployment.

#### CI Pipeline (`.github/workflows/ci.yml`)

The CI pipeline runs on:

- Push to `master` or `develop` branches
- Pull requests to `master` or `develop` branches

It performs the following checks:

- **Lint**: ESLint check
- **Test**: Jest test suite
- **Compile**: TypeScript compilation
- **Format Check**: Prettier formatting check

All checks must pass before a pull request can be merged.

#### Release Pipeline (`.github/workflows/release.yml`)

The release pipeline runs when a tag matching `v*.*.*` is pushed:

```bash
git tag v1.0.0
git push origin v1.0.0
```

It performs:

- Tests
- Compilation
- Linting
- Packages the extension as `.vsix`
- Creates a GitHub Release with the `.vsix` file

## Project Structure

```
zai-provider-extension/
├── .github/workflows/    # CI/CD configurations
│   ├── ci.yml           # CI pipeline
│   └── release.yml      # Release pipeline
├── src/                  # Source code
│   ├── extension.ts      # Extension entry point
│   ├── provider.ts       # Z.ai chat provider
│   ├── mcp.ts            # MCP protocol support
│   ├── types.ts          # Type definitions
│   └── utils.ts          # Utility functions
├── tests/                # Test files
├── __mocks__/            # Jest mocks
├── scripts/              # Build scripts
├── .vscodeignore         # Packaging exclusions
├── eslint.config.js      # ESLint configuration
├── jest.config.js        # Jest configuration
├── package.json          # Project metadata
├── tsconfig.json         # TypeScript configuration
└── README.md             # Project documentation
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode
- Provide type annotations for function parameters and return values
- Use interfaces for object shapes

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `chat-provider.ts`)
- **Classes**: `PascalCase` (e.g., `ZaiChatModelProvider`)
- **Functions/Variables**: `camelCase` (e.g., `initializeProvider`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`)
- **Interfaces**: `PascalCase` with `I` prefix optional (e.g., `IProviderConfig` or `ProviderConfig`)

### Comments

- Use JSDoc comments for public functions and classes
- Add comments for complex logic
- Keep comments up-to-date with code changes

## Submitting a Pull Request

1. Ensure all CI checks pass locally
2. Update documentation if needed
3. Commit your changes with clear messages:

   ```bash
   git commit -m "feat: add support for new model"
   # or
   git commit -m "fix: resolve connection timeout issue"
   ```

4. Push to your fork:

   ```bash
   git push origin feature/your-feature-name
   ```

5. Create a pull request on GitHub with:
   - Clear title and description
   - Reference any related issues
   - Screenshots for UI changes (if applicable)

## Testing

### Writing Tests

- Write tests for new functionality in the `tests/` directory
- Use Jest as the test framework
- Mock external dependencies (e.g., VS Code APIs)
- Aim for high code coverage

### Test Structure

```typescript
describe("FeatureName", () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it("should do something", () => {
    // Arrange
    // Act
    // Assert
  });
});
```

## Troubleshooting

### Common Issues

**TypeScript compilation errors:**

```bash
npm run compile
```

**Linting errors:**

```bash
npm run lint:fix
```

**Test failures:**

```bash
npm run test:watch
```

**Build issues:**

```bash
rm -rf out/ node_modules/
npm install
npm run compile
```

## Questions?

If you have questions or need help:

- Open an issue on GitHub
- Check existing issues for similar problems
- Review the documentation in `README.md`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
