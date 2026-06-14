<p align="center">
  <h1 align="center">Steno</h1>
  <p align="center">Open-source, local-first voice transcription</p>
  <p align="center">Own your data. Use any model you want. Free and open source.</p>
</p>

<p align="center">
  <!-- License Badge -->
  <a href="LICENSE" target="_blank">
    <img alt="AGPL-3.0 License" src="https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square" />
  </a>
  <!-- Platform Support Badges -->
  <img alt="macOS" src="https://img.shields.io/badge/-macOS-black?style=flat-square&logo=apple&logoColor=white" />
  <img alt="Windows" src="https://img.shields.io/badge/-Windows-blue?style=flat-square&logo=windows&logoColor=white" />
  <img alt="Linux" src="https://img.shields.io/badge/-Linux-yellow?style=flat-square&logo=linux&logoColor=white" />
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## What is Steno?

Steno is an open-source, local-first desktop transcription app. Press a shortcut, speak, and get text. Your audio goes directly from your machine to a local model or your chosen cloud provider -- no middleman, no vendor lock-in.

### Features

- **Local-first transcription** with Parakeet (NVIDIA NeMo) -- completely offline, completely free
- **Cloud transcription** via your own API keys (Groq, OpenAI, ElevenLabs, Deepgram)
- **AI-powered transformations** -- fix grammar, translate, reformat with any LLM (Ollama, OpenAI, Anthropic, etc.)
- **Voice Activity Detection (VAD)** -- hands-free recording that starts when you speak
- **Wake word detection** -- say a trigger word to start recording
- **Global hotkeys** -- system-wide keyboard shortcuts via rdev
- **Cross-platform** -- macOS, Windows, Linux
- **Tiny footprint** -- ~22MB, starts instantly (Svelte 5 + Tauri)

## Quick Start

### Install Steno

**macOS (Homebrew)**

```bash
brew install --cask steno
```

**macOS, Windows, Linux (Direct Download)**

Download the installer for your platform from GitHub Releases:

- macOS: `.dmg` (Apple Silicon or Intel)
- Windows: `.msi` or `.exe`
- Linux: `.AppImage`, `.deb`, or `.rpm`

**Full installation guide:** See [apps/steno/README.md](apps/steno/README.md)

### Build from Source

```bash
# Prerequisites:
# - Install Bun from https://bun.sh (run bun upgrade if there's issues)
# - Install Rust and Cargo from https://www.rust-lang.org/tools/install

git clone <your-repo-url>
cd voice_transcription
bun install
cd apps/steno
bun dev
```

> Want to contribute? See [CONTRIBUTING.md](CONTRIBUTING.md) for fork and PR instructions.

### Troubleshooting

If you encounter issues after switching branches or pulling changes (like "render_fn is not a function" errors), run from the repo root:

```bash
bun clean    # Clears caches and node_modules
bun install  # Reinstall dependencies
```

For a complete reset including Rust build artifacts (~10GB, takes longer to rebuild):

```bash
bun nuke     # Clears everything including Rust target
bun install
```

Note: You rarely need `bun nuke` since Cargo handles incremental Rust builds well. Use `bun clean` first; reserve `bun nuke` for when things are truly broken.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

## Tech Stack

<p align="center">
  <img alt="Svelte 5" src="https://img.shields.io/badge/-Svelte%205-orange?style=flat-square&logo=svelte&logoColor=white" />
  <img alt="Tauri" src="https://img.shields.io/badge/-Tauri-blue?style=flat-square&logo=tauri&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/-TypeScript-blue?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="Rust" src="https://img.shields.io/badge/-Rust-orange?style=flat-square&logo=rust&logoColor=white" />
  <img alt="TanStack Query" src="https://img.shields.io/badge/-TanStack%20Query-red?style=flat-square&logo=react-query&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/-Tailwind%20CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" />
</p>

## License

[AGPL-3.0](LICENSE). Build on it. Fork it. Make it yours. Please contribute if you can.
