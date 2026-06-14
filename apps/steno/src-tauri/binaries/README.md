# Bundled `llama-server` binaries

This folder ships prebuilt **llama.cpp `llama-server`** binaries with the app so
the transformation backend works with zero setup. Binaries live in **per-variant
subdirectories** so a GPU build and a CPU fallback can ship side by side:

```
binaries/
  vulkan/   llama-server[.exe] + libs   # GPU (Windows/Linux), vendor-agnostic
  cpu/      llama-server[.exe] + libs   # guaranteed CPU fallback (Windows/Linux)
  metal/    llama-server         + libs # universal macOS build (GPU + CPU)
```

Each subdirectory is bundled as a Tauri resource (`bundle.resources:
["binaries/*/*"]` in `tauri.conf.json`) and resolved at runtime by
`src/llama_server.rs` (`resolve_server_candidates`). At startup the app tries the
variants in preference order (`vulkan` → `metal` → `cpu`) and uses the first that
becomes healthy; a GPU build that can't load or crashes falls through to CPU.

## What to place here

Normally you don't populate this by hand — `bun run fetch-llama-server`
downloads the right release assets per platform and installs them into the
subdirectories above (it runs automatically in `beforeBuildCommand`). To do it
manually, download the official llama.cpp release for the **target platform** from
<https://github.com/ggml-org/llama.cpp/releases> and, for each variant, extract
into `binaries/<variant>/` so it contains:

- `llama-server` (Linux/macOS) or `llama-server.exe` (Windows)
- the shared libraries it needs (e.g. `libggml*.{so,dylib}` / `ggml*.dll`,
  backend libs like Vulkan/Metal as applicable)

The libraries must sit next to the binary inside the variant subdirectory.

## Why not compiled in-tree?

A prebuilt binary is used deliberately: compiling llama.cpp's C++ in-tree hit the
same Windows build problems that forced Whisper C++ off on Windows
(`src/transcription/mod.rs`). A prebuilt sidecar sidesteps that.

## Fallback

If no bundled variant resolves, the app falls back to the user-provided path in
**Settings → Transformation** (`llamacpp.serverPath`), which takes precedence over
the bundled variants when set. If nothing is available, the transformation step
returns a clear "no llama-server available" error.

## CI / release

`beforeBuildCommand` runs `bun run fetch-llama-server` before `tauri build`,
fetching the correct builds per platform. Override variants with
`LLAMA_CPP_VARIANT` (comma-separated, e.g. `vulkan,cpu`) or pin a release with
`LLAMA_CPP_RELEASE`. The actual binaries are git-ignored (see `.gitignore`)
because they are large and platform-specific.
