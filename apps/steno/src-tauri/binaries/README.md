# Bundled `llama-server` binary

This folder ships the prebuilt **llama.cpp `llama-server`** binary with the app so
the transformation backend works with zero setup. Everything in this folder is
bundled as a Tauri resource (`bundle.resources: ["binaries/*"]` in
`tauri.conf.json`) and resolved at runtime by `src/llama_server.rs`
(`resolve_bundled_llama_server` / `resolve_server_binary`).

## What to place here (per build platform)

Download the official llama.cpp release for the **target platform** from
<https://github.com/ggml-org/llama.cpp/releases> and extract its contents here,
so that this folder contains:

- `llama-server` (Linux/macOS) or `llama-server.exe` (Windows)
- the shared libraries it needs (e.g. `libggml*.{so,dylib}` / `ggml*.dll`,
  backend libs like CUDA/Metal/Vulkan as applicable)

The runtime looks for `binaries/llama-server` (or `binaries/llama-server.exe` on
Windows). The libraries must sit next to it.

## Why not compiled in-tree?

A prebuilt binary is used deliberately: compiling llama.cpp's C++ in-tree hit the
same Windows build problems that forced Whisper C++ off on Windows
(`src/transcription/mod.rs`). A prebuilt sidecar sidesteps that.

## Fallback

If no binary is present here, the app falls back to the user-provided path in
**Settings → Transformation** (`llamacpp.serverPath`). If neither is set, the
transformation step returns a clear "no llama-server available" error.

## CI / release

A release step should fetch the correct `llama-server` build per target triple
and drop it here before `tauri build`. The actual binaries are git-ignored (see
`.gitignore`) because they are large and platform-specific.
