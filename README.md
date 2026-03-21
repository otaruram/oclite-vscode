# OCLite - AI Image Generator & Gallery for VS Code

![OCLite Logo](assets/icon.png)

**AI-powered image generation with instant gallery, cloud storage, and secure sharing.** Generate professional game assets, UI mockups, character designs, and creative art directly in Visual Studio Code using SDXL Lightning, Flux, and GPT-4o mini.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/oclitesite.oclite-vscode?label=Marketplace&logo=visual-studio-code&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=oclitesite.oclite-vscode)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/oclitesite.oclite-vscode?label=Downloads&color=success)](https://marketplace.visualstudio.com/items?itemName=oclitesite.oclite-vscode)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/oclitesite.oclite-vscode?label=Rating&color=orange)](https://marketplace.visualstudio.com/items?itemName=oclitesite.oclite-vscode)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
![Verified Publisher](https://img.shields.io/badge/Publisher-Verified-blue?logo=microsoft)

---

## 🎨 What is OCLite?

OCLite is a **professional AI image generation extension** for Visual Studio Code that brings the power of Stable Diffusion XL, Flux, and GPT-4o mini directly into your development workflow. Perfect for:

- 🎮 **Game Developers** - Generate character sprites, textures, environments, and UI assets
- 🎨 **UI/UX Designers** - Create mockups, icons, and design concepts instantly
- 🖼️ **Digital Artists** - Produce high-quality artwork with AI assistance
- 💻 **Developers** - Visualize ideas and create placeholder assets quickly
- 📱 **Product Managers** - Generate visual concepts for presentations

### Why Choose OCLite?

✅ **Instant Gallery** - Auto-save all generated images with one-click access  
✅ **Secure Cloud Storage** - Azure Blob Storage with time-limited SAS URLs  
✅ **No API Keys Required** - Pre-configured and ready to use  
✅ **Multiple AI Models** - SDXL Lightning, Flux Schnell, Flux Dev, Animagine XL  
✅ **Smart Prompt Enhancement** - GPT-4o mini refines your prompts automatically  
✅ **Native VS Code Integration** - Chat participant, sidebar, and gallery views  
✅ **Enterprise Security** - XOR encryption, request signing, read-only URLs

---

[![Watch OCLite in Action](https://img.youtube.com/vi/bAfpFPK02g4/maxresdefault.jpg)](https://youtu.be/bAfpFPK02g4)

## 🚀 Quick Start

1. **Install** OCLite from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=oclitesite.oclite-vscode)
2. **Generate** images using `@oclite your prompt` in GitHub Copilot Chat
3. **View Gallery** - Click the 🖼️ Gallery button to see all your generated images
4. **Share** - Copy secure URLs or save images to your workspace

No configuration needed - works out of the box!

## ✨ Key Features

### 🎨 AI Image Generation

Generate professional-quality images using state-of-the-art AI models:

- **SDXL Lightning** - Ultra-fast generation (4 steps, <10 seconds)
- **Flux Schnell** - High quality, fast results
- **Flux Dev** - Maximum quality for production assets
- **Animagine XL** - Specialized for anime and manga styles
- **Realistic Vision** - Photorealistic images and portraits

### 🖼️ Instant Gallery

- **Auto-Save** - All generated images automatically saved to gallery
- **Fast Loading** - Local cache for instant access
- **Secure URLs** - Time-limited (1h), read-only SAS URLs
- **One-Click Actions** - Copy URL, generate code, set as background, delete
- **No Sign-In Required** - Works offline with local cache

### 💬 Chat Participant Integration

Type `@oclite` in GitHub Copilot Chat for conversational image generation:

```
@oclite warrior character for RPG game
@oclite modern UI dashboard mockup
@oclite fantasy landscape with mountains
@oclite pixel art character sprite
```

### 🤖 Smart Prompt Enhancement

GPT-4o mini automatically refines your prompts for better results:

- **Input**: "warrior character"
- **Enhanced**: "Realistic warrior character, heroic stance, intricate armor, atmospheric lighting, high-poly model, AAA quality, 8K textures"

### 🎯 Workspace Detection

Automatically suggests the best asset style based on your project:

| Project Type | Suggested Style |
| :--- | :--- |
| Unity / Unreal | Character / Environment / Texture |
| Godot | Pixel Art / 2D Sprites |
| React / Vue / Angular | UI Icons / Mockups |
| Web Development | Hero Images / Backgrounds |

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
| Cloud Storage | Azure Blob Storage | Secure image hosting with SAS URLs |
| UI Framework | VS Code Webview UI Toolkit | Native VS Code experience |
| Extension Host | TypeScript + VS Code API | Agent orchestration & commands |

### Complete Image Generation Pipeline

OCLite uses a **3-stage serverless pipeline** for optimal image generation with enterprise-grade security:

```text
Stage 1: Prompt Refinement (HttpTrigger2)
  ↓ User prompt → GPT-4o mini → Professional game art description
  
Stage 2: Image Generation (HttpTrigger1)  
  ↓ Refined prompt → SDXL Lightning → Base64 image data
  
Stage 3: Cloud Upload (HttpTrigger4)
  ↓ Base64 image → Azure Blob Storage → Secure SAS URL (read-only, 1h expiry)
```

This architecture ensures:
- **No local downloads** - Images go directly from generator to cloud storage
- **Secure sharing** - Time-limited SAS URLs with read-only access (sp=r, 1 hour)
- **Fast delivery** - Parallel processing with async Azure Functions
- **Cost efficiency** - Serverless scaling with pay-per-use pricing
- **Auto-save to gallery** - Generated images automatically appear in gallery
- **No manual upload** - All uploads via secure HttpTrigger4 pipeline

## AI Backend - AIAAS-oclite

The AI engine for this extension is the **[AIAAS-oclite](https://github.com/otaruram/AIAAS-oclite-)** project - a production-grade, containerized AI-as-a-Service platform built with Python FastAPI.

### 🎥 Watch The API Brain in Action
See our cloud-native backend managing users, API keys, rate limits, and dynamic models in this quick 1-minute deep dive:

[![OCLite Backend Dashboard](https://img.shields.io/badge/YouTube-Watch_Short_Video-FF0000?style=for-the-badge&logo=youtube)](https://youtube.com/shorts/kcbdoo6rdcE?si=l8UI8anOBljfLoD9)

### Data Flow

```text
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
       ├────────►│ HttpTrigger2        │  ← Refines prompt with GPT-4o mini
                 │ (Prompt Refinement) │
                 └──────────┬──────────┘
                            │ refined prompt
                            ▼
                 ┌─────────────────────┐
                 │ HttpTrigger1        │  ← Generates image with SDXL
                 │ (Image Generation)  │     Returns base64 data
                 └──────────┬──────────┘
                            │ base64 image
                            ▼
                 ┌─────────────────────┐
                 │ HttpTrigger4        │  ← Uploads to Azure Blob Storage
                 │ (Cloud Upload)      │     Returns SAS URL (1h expiry)
                 └──────────┬──────────┘
                            │ SAS URL
                            ▼
                 ┌─────────────────────┐
                 │ Save / Preview      │  ← Smart naming, workspace-aware
                 │ Share / Gallery     │     Public URL for sharing
                 └─────────────────────┘
```

### Project Structure

```text
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

### OCLite Chat with File & Vision Support

Type `@oclite` in GitHub Copilot Chat to generate images conversationally. You can also **attach files** (PDF, DOCX, TXT) to give the AI context, or attach **images** for the AI to analyze visually.

```text
@oclite analyze this UI mockup and recreate it
```

### OCLite Diagram (Mermaid)

OCLite includes a dedicated diagram generator. Describe your architecture, flow, or database schema, and OCLite will generate clean `Mermaid.js` syntax that can be previewed or exported instantly.

### OCLite Gallery & UI-to-Code

View your generated images in the **"My Gallery"** cloud dashboard.

- 🖼️ **Set as Background**: Instantly apply any AI-generated image as your VS Code editor background!
- 💻 **Generate Code**: Click a button to automatically convert any generated UI mockup image into clean HTML and Tailwind CSS!
- 🗑️ **Permanently Delete** cloud assets instantly.

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

### 2. Optional Cloud Features (Not Required)

> **Note**: Basic image generation works perfectly without cloud setup!

- **Microsoft Authentication**: Run `OCLite: Sign in with Microsoft` for cloud storage access  
- **Azure Blob Storage**: Run `OCLite: Configure Cloud Storage` to enable image sharing
- **Usage Analytics**: Run `OCLite: Configure Telemetry` to set up Application Insights (optional)

### 3. Generation Methods

- **Chat:** Type `@oclite <your prompt>` in Copilot Chat
- **Sidebar:** Select the OCLite icon in the Activity Bar and enter a prompt  
- **Agent:** Right-click a file or folder → **OCLite: Analyze & Generate Assets**

### 🎯 What Works Without Cloud Setup

✅ **Generate AI images** with multiple models  
✅ **Automatic cloud upload** with secure SAS URLs (read-only, 1h expiry)  
✅ **Auto-save to gallery** - images automatically appear after generation  
✅ **Instant gallery access** - no waiting, uses local cache  
✅ **Save images** to your local workspace  
✅ **Preview images** in VS Code editor  
✅ **Smart prompt enhancement** with GPT-4o mini  
✅ **Multi-agent analysis** for code-based asset generation  
✅ **Public sharing URLs** for generated images (secure, time-limited)

### ☁️ What Requires Cloud Setup (Optional)

📱 **Persistent cloud gallery** across devices (currently disabled for security)  
📊 **Usage analytics** and telemetry  
🔐 **Custom Azure storage** configuration (not recommended - use HttpTrigger4 pipeline)

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
- **Azure Connection Strings**: Encrypted using XOR encryption in source code
- **User Data**: Isolated per user with encrypted paths
- **No Direct Blob Access**: All uploads via secure HttpTrigger4 pipeline (no direct blob storage access)

### ☁️ **Cloud Features Security**

- **Secure SAS URLs**: Read-only (sp=r), 1-hour expiry, blob-level scope (sr=b)
- **No Permissive Access**: Removed insecure account-level SAS (was: rwdlacup, 5 years)
- **HttpTrigger4 Pipeline**: All uploads via secure backend (generates safe SAS URLs)
- **Rate Limiting**: 10 requests per minute per user to prevent abuse
- **Auto-cleanup**: Temporary files automatically removed
- **Gallery Security**: Local cache + secure SAS URLs (no direct blob storage queries)

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

### 🔐 **Security Best Practices**

- ✅ All image uploads via HttpTrigger4 (secure pipeline)
- ✅ SAS URLs: read-only, 1-hour expiry, blob-level scope
- ✅ No direct blob storage access from extension
- ✅ Gallery uses local cache + on-demand secure URLs
- ✅ No permissive account-level SAS tokens
- ❌ Never share SAS URLs with write/delete permissions
- ❌ Never use account-level SAS with long expiry

For more details, see [SECURITY.md](SECURITY.md).

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Release Notes

### 0.1.61

- **CRITICAL SECURITY FIX** — Disabled insecure blob storage SAS URL (was: rwdlacup permissions, 5 years expiry)
- **Secure Pipeline** — All uploads now via HttpTrigger4 (read-only SAS, 1 hour expiry)
- **Auto-Save to Gallery** — Generated images automatically saved and appear in gallery
- **Instant Gallery** — Gallery uses local cache for fast loading
- **Enhanced Logging** — Detailed logging for debugging gallery and generation issues
- **Better Error Handling** — User-friendly error messages with "View Logs" option

### 0.1.60

- **Complete 3-Stage Pipeline** — Integrated HttpTrigger2 → HttpTrigger1 → HttpTrigger4 flow
- **Automatic Cloud Upload** — All generated images automatically uploaded to cloud storage
- **Secure SAS URLs** — Time-limited (1 hour) read-only URLs for sharing
- **No Local Downloads** — Images go directly from generator to cloud storage
- **Fixed HttpTrigger4** — Corrected Azure Blob REST API authorization header format

### 0.0.4

- **3-Layer Security Model** — API credentials are now protected by XOR encryption, Webpack obfuscation, and per-request signing. No readable secrets exist in the compiled output.
- **Webpack Build System** — Migrated from plain `tsc` to Webpack + TerserPlugin for minified, mangled production bundles.
- **Zero User Configuration** — Users install and use immediately, no API key setup required.

### 0.0.3

- **3-Layer Security Model** — API credentials are now protected by XOR encryption, Webpack minification with variable mangling, and per-request signing. No readable URL or key exists in the packaged extension.
- **Zero-Config Experience** — Users no longer need to input any API key. Install and use immediately.
- **Webpack Build System** — Migrated from `tsc` to Webpack for a single optimized bundle with full minification.
- **Request Signing** — Every LLM call now includes a time-based `X-OCLite-Sig` signature header.

### 0.0.2

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

## 🔍 Search Keywords

OCLite is your all-in-one solution for:
- AI image generation in VS Code
- Stable Diffusion XL integration
- Image gallery management
- Game asset creation
- UI mockup generator
- Cloud storage for images
- Secure image sharing
- Midjourney alternative for developers
- DALL-E alternative for VS Code
- Automatic1111 alternative
- ComfyUI alternative
- AI art generator
- Creative asset management
- Developer productivity tools
- Visual Studio Code extensions

## 🌟 Popular Use Cases

### Game Development
- Character sprites and portraits
- Environment textures and backgrounds
- UI elements and icons
- Concept art and mood boards
- Item and weapon designs

### UI/UX Design
- Website mockups and hero images
- App interface concepts
- Icon sets and button designs
- Background patterns and textures
- Marketing materials

### Content Creation
- Blog post featured images
- Social media graphics
- Presentation visuals
- Documentation illustrations
- Placeholder images

### Software Development
- README banner images
- Project logos and branding
- Error state illustrations
- Loading screen graphics
- Tutorial screenshots

## 📊 Comparison

| Feature | OCLite | Midjourney | DALL-E | Stable Diffusion Web UI |
| :--- | :---: | :---: | :---: | :---: |
| VS Code Integration | ✅ | ❌ | ❌ | ❌ |
| Instant Gallery | ✅ | ✅ | ❌ | ❌ |
| No API Key Setup | ✅ | ❌ | ❌ | ❌ |
| Cloud Storage | ✅ | ✅ | ❌ | ❌ |
| Secure Sharing | ✅ | ✅ | ❌ | ❌ |
| Multiple Models | ✅ | ❌ | ❌ | ✅ |
| Smart Prompts (GPT-4) | ✅ | ❌ | ❌ | ❌ |
| Free Tier | ✅ | ❌ | ❌ | ✅ |
| Enterprise Security | ✅ | ✅ | ✅ | ❌ |

## 🤝 Support & Community

- 📖 [Documentation](https://github.com/otaruram/oclite-vscode)
- 🐛 [Report Issues](https://github.com/otaruram/oclite-vscode/issues)
- 💡 [Feature Requests](https://github.com/otaruram/oclite-vscode/issues)
- ⭐ [Star on GitHub](https://github.com/otaruram/oclite-vscode)

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Use of Microsoft trademarks must follow [Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general). Use of third-party trademarks is subject to those third parties' policies.

Marketplace: <https://marketplace.visualstudio.com/items?itemName=oclitesite.oclite-vscode>
