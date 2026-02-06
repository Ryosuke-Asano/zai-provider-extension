# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- CI/CD pipeline with GitHub Actions
  - Automated linting, testing, and compilation checks
  - Automated release workflow for tag pushes
- ESLint Flat Config configuration (ESLint v9)
- Prettier ignore file
- Contributing guidelines
- Changelog

### Changed

- Updated `package.json` scripts for better development workflow
- Added TypeScript ESLint dependencies
- Updated lint script for Flat Config

### Fixed

- N/A

## [0.5.2] - 2026-02-06

### Changed

- Updated README to reflect current model specs and troubleshooting notes

## [0.5.1] - 2026-02-06

### Changed

- Added Node.js types in `tsconfig.json` to support Buffer usage
- Updated `watch` script to use `tsc -w`

### Fixed

- Prevented tool result content from inflating request size
- Added safe truncation for tool result text and improved token estimation

## [0.5.0] - 2025-01-XX

### Added

- Support for GLM-4.7 and GLM-4.7 Flash (GLM-4.6V is kept internal for vision fallback)
- Tool calling support
- Streaming responses
- Vision support via GLM-OCR and internal GLM-4.6V fallback
- Thinking process display for GLM-4.7
- Detailed logging for image analysis and reasoning
- Secure API key storage using VS Code secret storage
- Command palette integration for API key management

[Unreleased]: https://github.com/Ryosuke-Asano/zai-vscode-chat/compare/v0.5.2...HEAD
[0.5.2]: https://github.com/Ryosuke-Asano/zai-vscode-chat/releases/tag/v0.5.2
[0.5.1]: https://github.com/Ryosuke-Asano/zai-vscode-chat/releases/tag/v0.5.1
[0.5.0]: https://github.com/Ryosuke-Asano/zai-vscode-chat/releases/tag/v0.5.0
