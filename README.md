# OCLite Copilot Extension

<div align="center">
  <img src="assets/icon.png" alt="OCLite Logo" width="128" />
  <p><strong>AI-powered creative asset generation for Visual Studio Code</strong></p>
  <p>
    <a href="https://marketplace.visualstudio.com/items?itemName=oclitesite.oclite-vscode"><img src="https://img.shields.io/visual-studio-marketplace/v/oclitesite.oclite-vscode?label=Marketplace&logo=visual-studio-code&color=007ACC" alt="VS Code Marketplace" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="License" /></a>
    <img src="https://img.shields.io/badge/Publisher-Verified-blue?logo=microsoft" alt="Verified Publisher" />
  </p>
</div>

---

## Overview

OCLite Copilot Extension brings AI image generation directly into your development workflow. Describe what you need in natural language, and the extension's **multi-agent pipeline** refines your prompt through GPT-4o mini before generating high-fidelity images — all without leaving VS Code.

### New: Multi-Agent Pipeline

OCLite now includes an **agentic system** that can analyze your code and automatically generate relevant visual assets:

1. **Context Analyzer Agent** — Reads your source files and identifies entities that need visual assets.
2. **Creative Prompt Agent** — Transforms the analysis into detailed, optimized image-generation prompts.
3. **Orchestrator** — Coordinates the agents and delivers results to the UI.

Right-click any file or folder in the Explorer and select **"OCLite: Analyze & Generate Assets"** to try it.

## Architecture

### Cloud-Native & Serverless

| Component | Technology | Role |
| :--- | :--- | :--- |
| LLM Gateway | Azure Functions (Node.js) | Serverless proxy to GPT-4o mini |
| Secrets Management | Azure Key Vault | Secure API key storage |
| Image Generation | SDXL, Flux, Animagine (via OCLite API) | High-fidelity asset generation |
| UI Framework | VS Code Webview UI Toolkit | Native VS Code experience |
| Extension Host | TypeScript + VS Code API | Agent orchestration & commands |

### Data Flow

```
User prompt  OR  Right-click file/folder
       │                    │
       │                    ▼
       │         ┌─────────────────────┐
       │         │ Context Analyzer    │  ← Reads code, extracts entities
       │         │ Agent               │
       │         └──────────┬──────────┘
       │                    │ creative brief
       │                    ▼
       │         ┌─────────────────────┐
       ├────────►│ Creative Prompt     │  ← Generates optimized prompts
                 │ Agent (GPT-4o mini) │
                 └──────────┬──────────┘
                            │ refined prompt
                            ▼
                 ┌─────────────────────┐
                 │ Image Generation    │  ← SDXL Lightning, Flux, etc.
                 │ (OCLite API)        │
                 └──────────┬──────────┘
                            │ image
                            ▼
                 ┌─────────────────────┐
                 │ Save / Preview      │  ← Smart naming, workspace-aware
                 └─────────────────────┘
```

### Project Structure

```
src/
├── agents/
│   ├── AgentOrchestrator.ts      # Coordinates the multi-agent pipeline
│   ├── ContextAnalyzerAgent.ts   # Reads & analyzes code files
│   └── CreativePromptAgent.ts    # Brief → detailed image prompts
├── services/
│   ├── llm.ts                    # Single LLM gateway (GPT-4o mini)
│   └── ai.ts                    # Prompt refinement & smart naming
├── panels/
│   ├── ChatProvider.ts           # Chat webview + agent request handler
│   └── SidebarProvider.ts        # Image generation sidebar
├── utilities/
│   ├── getNonce.ts               # CSP nonce generation
│   ├── getUri.ts                 # Webview URI helper
│   └── secrets.ts                # XOR crypto + request signing (Layer 1 & 3)
└── extension.ts                  # Entry point, command registration
```

## Features

### Chat Participant

Type `@oclite` in GitHub Copilot Chat to generate images conversationally.

```text
@oclite a futuristic cyberpunk city at night with neon lights
```

### Agent-Powered Analysis

Right-click any file or folder and select **"OCLite: Analyze & Generate Assets"**. The agent pipeline will:

1. Read and understand your code context.
2. Identify entities that need visual assets.
3. Generate optimized prompts automatically.
4. Display results in the Chat panel.

### Sidebar Panel

A dedicated sidebar with a full generation UI, real-time progress feedback, and workspace-aware suggestions.

### Multi-Model Support

| Model | Description |
| :--- | :--- |
| `sdxl-lightning` | Fastest generation (default) |
| `flux-schnell` | High quality, fast |
| `flux-dev` | High quality, standard |
| `animagine-xl` | Anime style specialized |
| `realistic-vision` | Photorealistic style |

### Workspace Detection

Automatically detects the project type and suggests the best asset style:

| Project | Suggested Style |
| :--- | :--- |
| Unity | Character / Texture |
| Unreal Engine | Environment / Texture |
| Godot | Pixel Art |
| React / Vue / Angular | UI Icon |

## Prerequisites

- [Visual Studio Code](https://code.visualstudio.com/) 1.90.0 or later
- [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat) extension (for the `@oclite` chat participant)

> **No API key required.** OCLite's AI services are fully embedded and ready to use out-of-the-box.

## Getting Started

1. Install the extension from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=oclitesite.oclite-vscode).
2. Start generating immediately — no configuration needed:
   - **Chat:** Type `@oclite <your prompt>` in Copilot Chat.
   - **Sidebar:** Select the OCLite icon in the Activity Bar and enter a prompt.
   - **Agent:** Right-click a file or folder → **OCLite: Analyze & Generate Assets**.

## Extension Settings

| Setting | Description | Default |
| :--- | :--- | :--- |
| `oclite.apiKey` | Your OCLite API key | — |
| `oclite.model` | AI model for image generation | `sdxl-lightning` |

## Commands

| Command | Description |
| :--- | :--- |
| `OCLite: Set API Key` | Store your OCLite API key |
| `OCLite: Analyze & Generate Assets` | Run the multi-agent pipeline on a file or folder |
| `OCLite: Save Image to Workspace` | Save a generated image to your project |
| `OCLite: Save Image from URL` | Save an image from a URL |
| `OCLite: Preview Generated Image` | Open a generated image in the editor |
| `OCLite: Clear API Key` | Remove your stored API key |

## Security

OCLite uses a **3-layer security model** to protect all API credentials — even inside the packaged `.vsix` file.

| Layer | Mechanism | Effect |
| :--- | :--- | :--- |
| **Layer 1 — XOR Encryption** | All URLs and keys are stored as encrypted byte arrays (`secrets.ts`) | No readable string exists in source or compiled output |
| **Layer 2 — Webpack Minification** | Webpack + TerserPlugin mangles all variable names and strips comments | Reverse-engineering the compiled JS is extremely difficult |
| **Layer 3 — Request Signing** | Every API call includes a time-based `X-OCLite-Sig` header | The raw URL alone cannot be reused outside the extension |

- **Zero User Configuration** — No API key input required. All credentials are embedded securely; users install and use immediately.
- **Git-Safe** — The sensitive `llm.ts` file is excluded from source control via `.gitignore`. A safe template (`llm.ts.example`) is provided for contributors.
- **Content Security Policy** — Webview panels use cryptographic nonces to prevent script injection.
- **Verified Publisher** — Published as a verified publisher on the VS Code Marketplace.

For more details, see [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Release Notes

### 0.0.4

- **3-Layer Security Model** — API credentials are now protected by XOR encryption, Webpack obfuscation, and per-request signing. No readable secrets exist in the compiled output.
- **Webpack Build System** — Migrated from plain `tsc` to Webpack + TerserPlugin for minified, mangled production bundles.
- **Zero User Configuration** — Users install and use immediately, no API key setup required.

### 0.0.3

- **3-Layer Security Model** — API credentials are now protected by XOR encryption, Webpack minification with variable mangling, and per-request signing. No readable URL or key exists in the packaged extension.
- **Zero-Config Experience** — Users no longer need to input any API key. Install and use immediately.
- **Webpack Build System** — Migrated from `tsc` to Webpack for a single optimized bundle with full minification.
- **Request Signing** — Every LLM call now includes a time-based `X-OCLite-Sig` signature header.

### 0.0.3

- **Multi-Agent Pipeline** — New `ContextAnalyzerAgent`, `CreativePromptAgent`, and `AgentOrchestrator` for code-aware asset generation.
- **Refactored LLM Gateway** — Single `llm.ts` module eliminates code duplication across services.
- **Right-click to Analyze** — New context menu command for analyzing files and folders.
- **Cleaner Architecture** — Separated concerns into `agents/`, `services/`, and `panels/`.

### 0.0.1

- Initial release.
- Chat participant (`@oclite`) and sidebar panel.
- LLM-powered prompt refinement via GPT-4o mini.
- Multi-model image generation (SDXL Lightning, Flux, Animagine, Realistic Vision).
- Smart auto-naming via LLM with keyword fallback.
- Workspace detection for Unity, Unreal, Godot, React, Vue, Angular.

## License

This project is licensed under the [MIT License](LICENSE).

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Use of Microsoft trademarks must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general). Use of third-party trademarks is subject to those third parties' policies.
