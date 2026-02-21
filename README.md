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

### 1. Install the Extension
- Install from [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=oclitesite.oclite-vscode)
- Or install manually: `code --install-extension oclite-vscode-x.x.x.vsix`

### 2. Basic Setup
1. **Set API Key**: Run `OCLite: Set API Key` command to configure your OCLite API key
2. **Start Creating**: Use any of the generation methods below

### 3. Optional Cloud Features
- **Microsoft Authentication**: Run `OCLite: Sign in with Microsoft` for cloud storage access
- **Azure Blob Storage**: Run `OCLite: Configure Cloud Storage` to enable image sharing
- **Usage Analytics**: Run `OCLite: Configure Telemetry` to set up Application Insights (optional)

### 4. Generation Methods
- **Chat:** Type `@oclite <your prompt>` in Copilot Chat
- **Sidebar:** Select the OCLite icon in the Activity Bar and enter a prompt  
- **Agent:** Right-click a file or folder → **OCLite: Analyze & Generate Assets**

## Extension Settings

| Setting | Description | Default |
| :--- | :--- | :--- |
| `oclite.apiKey` | Your OCLite API key | — |
| `oclite.model` | AI model for image generation | `sdxl-lightning` |

## Commands

| Command | Description |
| :--- | :--- |
| `OCLite: Set API Key` | Store your OCLite API key securely |
| `OCLite: Sign in with Microsoft` | Authenticate for cloud storage features |
| `OCLite: Configure Cloud Storage` | Set up Azure Blob Storage for image sharing |
| `OCLite: Configure Telemetry` | Set up Application Insights analytics (optional) |
| `OCLite: Analyze & Generate Assets` | Run the multi-agent pipeline on a file or folder |
| `OCLite: Save Image to Workspace` | Save a generated image to your project |
| `OCLite: Save Image from URL` | Save an image from a URL |
| `OCLite: Preview Generated Image` | Open a generated image in the editor |
| `OCLite: Share Image Link` | Generate shareable public URL for generated images |
| `OCLite: View Gallery` | Browse your cloud image gallery |
| `OCLite: View Rate Limit Status` | Check current usage limits |
| `OCLite: Clear API Key` | Remove your stored API key |

## Security & Privacy

OCLite uses enterprise-grade security to protect your data:

### 🔒 **Secure Storage**
- **API Keys**: Stored in VS Code's secure credential store (never in plain text)
- **Azure Connection Strings**: Encrypted using VS Code's secrets API
- **User Data**: Isolated per Microsoft account with encrypted paths

### ☁️ **Cloud Features Security**
- **Microsoft Authentication**: Official VS Code authentication APIs
- **Blob Storage**: User-isolated containers with public read URLs for sharing
- **Rate Limiting**: 10 requests per minute per user to prevent abuse
- **Auto-cleanup**: Temporary files automatically removed

### 📊 **Telemetry (Optional)**
- **Privacy First**: Anonymous usage analytics only (no prompts, images, or personal data)
- **Respects Settings**: Automatically disabled if VS Code telemetry is disabled
- **User Control**: Can be configured or disabled individually

### 🛡️ **Legacy Security Model**
OCLite also includes a 3-layer security system for API credential protection:

| Layer | Mechanism | Effect |
| :--- | :--- | :--- |
| **Layer 1 — XOR Encryption** | URLs and keys stored as encrypted byte arrays | No readable strings in source or output |
| **Layer 2 — Webpack Minification** | Variable name mangling and comment stripping | Reverse-engineering protection |
| **Layer 3 — Request Signing** | Time-based `X-OCLite-Sig` headers | Prevents credential reuse outside extension |
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
