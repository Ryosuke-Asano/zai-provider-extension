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

## [0.5.0] - 2025-01-XX

### Added

- Support for GLM-4.7, GLM-4.7 Flash, and GLM-4.6V models
- Tool calling support
- Streaming responses
- Vision support for all models
- Thinking process display for GLM-4.5/4.6/4.7
- Detailed logging for image analysis and reasoning
- Secure API key storage using VS Code secret storage
- Command palette integration for API key management

[Unreleased]: https://github.com/Ryosuke-Asano/zai-vscode-chat/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Ryosuke-Asano/zai-vscode-chat/releases/tag/v0.5.0
