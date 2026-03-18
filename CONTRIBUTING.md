# Contributing to OCLite Copilot Extension

Thank you for your interest in contributing to the OCLite VS Code extension. This document explains how to set up a development environment and submit changes.

## Prerequisites

- [Visual Studio Code](https://code.visualstudio.com/) 1.90.0 or later
- [Node.js](https://nodejs.org/) 20.x or later
- [Git](https://git-scm.com/)

## Development Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/oclite/oclite-vscode.git
   cd oclite-vscode
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Compile the project:

   ```bash
   npm run compile
   ```

4. Press **F5** in Visual Studio Code to launch the Extension Development Host.

## Project Structure

| Path | Description |
| :--- | :--- |
| `src/extension.ts` | Extension entry point, chat participant, and commands |
| `src/services/ai.ts` | AI service (LLM prompt refinement, smart naming) |
| `src/panels/SidebarProvider.ts` | Sidebar webview provider |
| `src/utilities/` | Helper functions (`getNonce`, `getUri`) |
| `media/` | Webview CSS and JavaScript |
| `assets/` | Extension icons |

## Available Scripts

| Script | Description |
| :--- | :--- |
| `npm run compile` | Compile TypeScript to JavaScript |
| `npm run watch` | Compile in watch mode |
| `npm run lint` | Run ESLint |

## Submitting Changes

1. Create a feature branch from `main`:

   ```bash
   git checkout -b feat/your-feature-name
   ```

2. Make your changes and verify they compile without errors:

   ```bash
   npm run compile
   ```

3. Run the linter:

   ```bash
   npm run lint
   ```

4. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/):

   ```bash
   git commit -m "feat: add new feature"
   ```

5. Push your branch and open a pull request.

## Code Style

- Use TypeScript strict mode.
- Follow the existing code conventions in the repository.
- Keep functions focused and well-documented with JSDoc comments.

## Reporting Issues

Open an issue on GitHub with:

- A clear description of the problem.
- Steps to reproduce.
- Expected and actual behavior.
- VS Code version and operating system.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
