# Local Model Stack Upgrade — FP32 v2 transcription + Qwen3 on bundled llama.cpp

**Date:** 2026-06-10
**Status:** Implemented, compiles/typechecks/builds, dev app launched and partially verified live. A few runtime checks remain (see "Remaining").

## Context

Research (Open ASR Leaderboard 2026 + 2026 local-LLM landscape) drove four decisions to maximize transcription speed+accuracy and add a responsive, zero-setup local transformation backend:

1. **Transcription INT8 → FP32.** Parakeet runs at ~3332 RTFx (≈3000× real-time) — huge headroom, so FP32 buys accuracy at no perceptible latency cost.
2. **Parakeet v3 → v2 (English-only).** Users are English-only; v2 edges v3 on English WER.
3. **Transformation default → Qwen3** (best local instruction-following). Ship Qwen3 8B (default) + Qwen3 4B.
4. **Local LLM hosting → bundled llama.cpp `llama-server` sidecar** (prebuilt, not in-tree C++, because in-tree C++ already broke Whisper on Windows). Ollama kept as an optional backend.

`transcribe-rs` 0.2.1 supports FP32 + Int8 only (no fp16), so #1 targets FP32.

## What changed

### Transcription (FP32 v2)
- `src-tauri/src/transcription/model_manager.rs`, `src-tauri/src/bin/transcribe.rs`: `ParakeetModelParams::int8()` → `::fp32()`.
- `src/lib/services/isomorphic/transcription/local/parakeet.ts`: `PARAKEET_MODELS` entry replaced with `parakeet-tdt-0.6b-v2-fp32` (~2.5 GB) from HF `istupakov/parakeet-tdt-0.6b-v2-onnx`. **Includes the `encoder-model.onnx.data` external-data file (2.44 GB)** — required alongside `encoder-model.onnx`.
- `src/routes/(app)/(config)/settings/transcription/+page.svelte`: updated source link/copy.

### Transformation (Qwen3 via bundled llama.cpp)
- `src-tauri/src/llama_server.rs` (new): spawn-by-path lifecycle manager (mirrors `wakeword.rs`; tokio `Command` + `Arc<Mutex>`), HTTP `/health` readiness poll. Commands: `start_/stop_/get_llama_server_status`, `resolve_bundled_llama_server`. Registered + state managed in `src-tauri/src/lib.rs`.
- `resolve_server_binary`: explicit `llamacpp.serverPath` wins → else bundled `binaries/llama-server[.exe]` via `BaseDirectory::Resource`.
- `src/lib/services/isomorphic/completion/llamacpp.ts` (new): OpenAI-compatible `/v1/chat/completions` client; exported from `completion/index.ts`.
- `src/lib/services/isomorphic/completion/local/{types,qwen}.ts` (new): `LLM_MODELS` manifest — `qwen3-8b` (default, ~4.7 GB) + `qwen3-4b` (~2.3 GB) from official Qwen GGUF repos.
- `src/lib/query/isomorphic/transformer.ts`: `prompt_transform` now branches on `completion.provider` — llamacpp lazily ensures the sidecar then calls it; Ollama path preserved.
- `src/lib/settings/settings.ts`: added `completion.provider` (default `llamacpp`), `llamacpp.*` (serverPath/modelPath/model/port/contextSize/gpuLayers/defaultPrompt); `ollama.model` default → `qwen3:8b`.
- `src/routes/(app)/(config)/settings/transformation/+page.svelte` (new, replaces the Ollama page; nav updated, old route removed): backend toggle, Qwen3 select + GGUF download, optional server-path override with bundled-binary detection. `PATHS.MODELS.LLM()` added.

### Bundling + fetch automation (zero-setup)
- `src-tauri/tauri.conf.json`: `bundle.resources += "binaries/*"`; `beforeBuildCommand` now runs `bun run fetch-llama-server && bun run build`.
- `src-tauri/binaries/` (README + .gitignore; binaries git-ignored).
- `scripts/fetch-llama-server.ts` + `fetch-llama-server` package script: downloads the right llama.cpp release asset per platform (win `.zip` via .NET ZipFile; mac/linux `.tar.gz` via tar), prunes to `llama-server` + shared libs (~46 MB), installs into `src-tauri/binaries/`. Idempotent (`--force` to re-pull). Env: `LLAMA_CPP_RELEASE` (default latest), `LLAMA_CPP_VARIANT` (default `cpu`; e.g. `vulkan`, `cuda-12.4`), `GITHUB_TOKEN`.

## Verification

- ✅ Monorepo `bun run typecheck` (6/6 packages), `bun run build`, `cargo check` (lib + bin) — all green.
- ✅ `fetch-llama-server` on Windows x64 → installed `llama-server.exe` + 29 libs; `llama-server.exe --version` runs (b9585). Idempotent; binaries git-ignored, docs tracked.
- ✅ `bun run dev` (tauri dev) compiled and launched; FFmpeg detected on host; **Parakeet v2 FP32 model downloads from the HF URLs through the app** (config/encoder verified, 2.44 GB data file downloading).
- Fixed during work: `Bun.write(path, Response)` hangs → buffer via arrayBuffer; GNU `tar` can't unzip + mis-parses `C:` → .NET ZipFile on Windows.

## Remaining

1. **Ship the llama-server binary in CI/release** — `beforeBuildCommand` runs `fetch-llama-server` automatically, but confirm a real `tauri build` bundles + resolves it on each target. (Local dev resolution of the bundled resource is unconfirmed; the Settings page shows detection and falls back to a user-set path.)
2. **Run the macOS/Linux branch of `fetch-llama-server`** (tar / `bin-macos-*` / `bin-ubuntu-x64`) — only the Windows path is exercised so far.
3. **Runtime end-to-end checks in the GUI**: (a) transcription returns text with the FP32 v2 model; (b) a transform downloads Qwen3, spawns llama-server, and returns text; (c) Ollama fallback still works.
4. **Optional**: GPU llama-server variant for default (Vulkan), and mirroring the Parakeet FP32 ONNX on EpicenterHQ releases for bandwidth.

---

## Follow-up: post-launch testing fixes (2026-06-10)

Confirmed live in `bun run dev`: app builds + launches; **both models fully downloaded through the app** (Parakeet v2 FP32 ~2.5 GB and Qwen3 8B = 5,027,783,488 bytes); the **bundled llama-server resolves in dev** (Settings → Transformation shows the resolved `…/target/debug/binaries/llama-server.exe`), so dev resource resolution works (resolves the earlier "unconfirmed" note in Remaining #1).

### Fixes made during testing

- **Removed dev-only on-screen widgets** (they were showing in the app):
  - `src/routes/+layout.svelte`: dropped the **TanStack Query Devtools** mount (it was unconditional — would have shipped to prod) and the inspector-repositioning `<style>`.
  - `svelte.config.js`: Svelte **inspector toggle button** → `showToggleButton: 'never'` (keeps the Alt+X dev inspector, hides the on-screen button; it never ships in prod anyway).
- **LLM download state hoisted to a store** — `src/lib/state/llm-download.svelte.ts` (`llmDownload`). Lives outside the component so an in-flight download + its % survive navigation, remounts, and window focus (in-component `$state` was being reset by the settings store re-syncing on focus / nav-link hover). The Transformation page reads `llmDownload.state` and calls `llmDownload.download()` / `refreshStatus()`.
- **Voice Commands UI was unreachable** — the `/voice-commands` route (Create/Edit + Shell Allowlist) existed but had **no nav link** (a Tauri window has no address bar). Added a **Voice Commands** entry to `VerticalNav.svelte` (megaphone) and an **"Open Voice Commands"** button on the Settings → Voice Commands page. Settings page only ever held the *activation* (enable + prefix + threshold).
- **Shell action → dropdown** — in both `voice-commands/CreateVoiceCommandButton.svelte` and `EditVoiceCommandModal.svelte`, the free-text "command ID" field is now a `<Select>` populated from `rpc.voiceCommands.shellAllowlist.getAll` (label = entry title/command, value = id), with an empty-state hint linking to `/voice-commands/allowlist`.

### New tooling

- **`scripts/migrate-dev-data.ts`** (`bun run migrate-dev-data`, `--dry-run` / `--force`). Migrates models + settings from the dev data dir (`io.steno.app.dev`) to the prod dir (`io.steno.app`) for a clean install without re-downloading. Dry-run verified: copies ~7,192 MB of models and rewrites 2 path keys in `settings.json` (`transcription.parakeet.modelPath`, `llamacpp.modelPath`), clears `llamacpp.serverPath`. Works because `createPersistedState` reads `settings.json` as a fallback on first launch (empty localStorage).

### Known constraint: dev vs prod data dir
Dev (`bun run dev`) uses identifier **`io.steno.app.dev`**; a production `tauri build` uses **`io.steno.app`** — **separate** app-data folders. So models/settings don't carry over automatically. To keep everything when moving to an installed app: `bun tauri build` → install (don't launch) → `bun run migrate-dev-data` → launch. (Run migration before the first prod launch, or its localStorage seeds defaults and won't read the migrated `settings.json`.)

### Still pending (runtime, GUI)
Actual transcription/transform inference still to confirm end-to-end: (a) transcript returned from the FP32 v2 model; (b) a transform spawns llama-server and returns text; (c) Ollama fallback. Models are downloaded, so these are testable now.
