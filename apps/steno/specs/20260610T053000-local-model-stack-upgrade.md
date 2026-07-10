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
4. **Optional**: ✅ GPU llama-server variant (Vulkan) as default with CPU fallback — see "Follow-up: GPU llama-server variant" below. ⬜ Mirroring the Parakeet FP32 ONNX on EpicenterHQ releases for bandwidth (still open; blocked by GitHub's 2 GB per-asset limit vs the 2.44 GB encoder data file — needs object storage, not a GitHub release).

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

### Runtime inference — VERIFIED end-to-end (2026-06-14)
Engine-level end-to-end test against the real downloaded models (GUI window automation of a native Tauri app is impractical, so the actual inference engines were exercised directly with the real model files; the button→invoke→display wiring is the only unverified remainder and is low-risk):
- ✅ **(a) Transcription** — `cargo run --release --bin transcribe` on a TTS-generated WAV, against the FP32 v2 Parakeet dir, returned a perfect transcript *with* punctuation/casing: "The quick brown fox jumps over the lazy dog near the riverbank."
- ✅ **(b) Transform via bundled Vulkan llama-server** — spawned `binaries/vulkan/llama-server.exe -m Qwen3-8B-Q4_K_M.gguf -ngl 99 --jinja`, POSTed a grammar-fix to `/v1/chat/completions`; "the quick brown fox jump over the lazy dog near the riverbank" → "The quick brown fox jumps over the lazy dog near the riverbank." **Ran on GPU**: log enumerates Vulkan0 NVIDIA RTX PRO 5000 + Vulkan1 Intel, auto-fits to device memory, and generated at **42 tok/s** (CPU-only on this Core Ultra 9 would be ~8–12 t/s) — confirms the 4a GPU path live.
- ✅ **(c) Ollama fallback** — same grammar-fix via Ollama's `/v1/chat/completions` (qwen3-vl:8b) → identical correct output.

**Caveat noted (now FIXED — see below):** Qwen3 ran with thinking enabled (`thinking = 1`, 207 completion tokens for a one-line answer); content returned clean, but disabling thinking cuts transform latency dramatically.

---

## Follow-up: disable Qwen3 thinking for transforms (2026-06-14)

Measured the cost of thinking on the live bundled Vulkan llama-server + Qwen3-8B for a grammar-fix: thinking ON = **12.06s / 553 tokens**; `chat_template_kwargs.enable_thinking=false` = **2.18s / 15 tokens**; `/no_think` soft switch = 3.33s / 19 tokens — all three **byte-identical correct output**. Thinking adds ~5.5× latency for zero quality on instruction-following transforms, so it's now **off by default** (provider-agnostic, user-toggleable).

### What changed
- **`src/lib/settings/settings.ts`** — new `completion.enableThinking` (`boolean = false`).
- **`completion/llamacpp.ts`** — `complete()` takes `enableThinking` (default false), sends `chat_template_kwargs: { enable_thinking }` (server runs `--jinja`; non-Qwen templates ignore the unknown kwarg). Confirmed live: `enable_thinking:false` → 15 tokens.
- **`completion/ollama.ts`** — `complete()` takes `enableThinking`, sends top-level `think` on `/api/generate`. Verified `think:false` is **safe on non-thinking models** (no error; clean answer always lands in `response`, which is all this client reads).
- **`src/lib/query/isomorphic/transformer.ts`** — both the llamacpp and ollama branches pass `settings.value['completion.enableThinking']`.
- **Transformation settings page** — added a "Reasoning" toggle (horizontal `Field` + `Switch`), shown for both backends, default off, copy noting it makes transforms slower.

### Verification
- ✅ `bun run typecheck` clean (1999 files, 0 errors).
- ✅ Live three-way latency/quality comparison above (numbers from the actual bundled binary + GGUF).
- Ollama `think:false` nuance: on the *vision* model `qwen3-vl:8b` it didn't fully suppress reasoning (routed it to a separate `thinking` field), but `response` was still clean. The app default `qwen3:8b` (text) honors it properly; either way the client only consumes `response`.

### Still unverified (low-risk)
GUI button→`invoke`→display wiring in the running app; real `tauri build` bundling per target; macOS/Linux fetch + Metal path; live GPU→CPU runtime fallback (loop is in place, not yet forced to fail).

---

## Follow-up: GPU llama-server variant + CPU fallback (2026-06-14)

Implemented option 4a: prefer a GPU (Vulkan) llama-server build, fall back to CPU automatically. The transform step is the only real latency in the pipeline (transcription is ~3000× real-time), so this targets the actual bottleneck while staying zero-setup (the Vulkan loader ships with GPU drivers — no CUDA toolkit).

### What changed
- **`scripts/fetch-llama-server.ts`** — now fetches a **list** of variants into **per-variant subdirs** `src-tauri/binaries/<variant>/`. Per-platform defaults: Windows/Linux = `vulkan` + `cpu`; macOS = the single universal `metal` build (variant ignored). `LLAMA_CPP_VARIANT` overrides as a comma list (e.g. `vulkan,cpu`, `cuda-12.4`). Cleans any legacy flat install first; each variant subdir is wiped + reinstalled on `--force`.
- **`src-tauri/tauri.conf.json`** — `bundle.resources` `binaries/*` → **`binaries/*/*`** (bundles the variant subdirs). NB: Tauri's build script errors if this glob matches nothing, so a bare `cargo check`/`tauri build` requires `fetch-llama-server` to have run first (it does, via `beforeBuildCommand`).
- **`src-tauri/src/llama_server.rs`** — `resolve_server_binary` → **`resolve_server_candidates`**: returns an ordered `(variant, path)` list (explicit `llamacpp.serverPath` wins; else bundled `binaries/<variant>/llama-server` in preference order `vulkan → metal → cpu`). `start_llama_server` now **tries each candidate in turn**, via a new `spawn_and_wait_health` helper that spawns one binary, drains its pipes, and polls `/health` — bailing **immediately on early process exit** (`child.try_wait()`) so a GPU build that can't load / crashes / OOMs falls through to the next candidate fast instead of burning the full 60s. First healthy backend wins; logs which one. `resolve_bundled_llama_server` returns the first candidate (UI unchanged).
- **Transformation settings page** — bundled-binary description now notes it prefers GPU (Vulkan/Metal) and falls back to CPU.
- **`binaries/README.md`** — documents the per-variant layout + runtime preference order.

### Verification
- ✅ `bun run fetch-llama-server --force` on Windows → installed `vulkan/` (llama-server.exe + 30 libs incl. `ggml-vulkan.dll`, 111 MB) and `cpu/` (+ 29 libs, 40.5 MB); legacy flat files cleaned; top level holds only docs + the two subdirs.
- ✅ `vulkan/llama-server.exe --version` → b9628, exit 0; `--list-devices` enumerates **NVIDIA RTX PRO 5000 (24 GB)** + Intel iGPU, confirming the Vulkan backend loads and sees GPUs on this host.
- ✅ `cargo check --lib` clean; monorepo `bun run typecheck` clean (1999 files, 0 errors).
- ⬜ Not yet: real `tauri build` bundling both variants per target; the macOS/Linux fetch branch; live confirmation that the runtime fallback picks CPU when the GPU path is forced to fail (the loop + early-exit detection is in place but untested against an actual GPU failure).

### macOS note
"Vulkan as default" is a Windows/Linux story. macOS uses the universal `metal` build (one binary, GPU + internal CPU fallback), installed under `binaries/metal/` and resolved second in the preference order — so no separate CPU build is fetched there.

## Status update (2026-06-22)

**GUI transcription pipeline now verified end-to-end** in the dev app (record → Parakeet transcript → clipboard + paste → DB save), including the first-ever cold model-load (previously only the standalone `transcribe` bin was tested). Two fixes shipped (commit `1f9eed9`, pushed):

- **Cold-start / large-recording failure fixed.** `transcription/local/parakeet.ts` passed audio to `invoke('transcribe_audio_parakeet')` as `Array.from(new Uint8Array(blob))` — a multi-million-element plain JS array Tauri serializes to JSON. For recordings >~3.6 MB this stalled the JS main thread so the invoke never reached Rust (no engine log) and starved the parallel DB save (user saw "saved" toast, then no transcript / no clipboard / empty recordings dir). Fix: pass the `Uint8Array` directly (Tauri v2 raw-bytes → Rust `Vec<u8>`). Verified with a **26 MB cold-start recording** end-to-end.
- **Warm-load added.** New `preload_parakeet_model` Tauri command (wraps the idempotent `get_or_load_parakeet`), called fire-and-forget from `+layout.svelte` `onMount`, so the first recording skips the ~10 s cold model-load. NB the `ModelManager` 5-min `idle_timeout`/`unload_if_idle()` is **dead code (never called)** — the model stays resident all session, so warm-load is a clean one-time win.

**Other commits this branch (all pushed):** cloud transformation provider `9224fe5`; desktop UI fixes (sidebar/tray/heart) `11c7991`; settings-persistence bug fix `a34dbc2`; ARM64 Snapdragon port prep `522c0a5`. Branch `local-model-stack-gpu` = 8 commits on origin (incl. this docs status commit `376b38e`), no PR.

**Hardware direction:** deploying on a **Snapdragon X2 Elite (Windows ARM64)** laptop in cloud-transform mode. Native-ARM64 port is research-confirmed viable (High confidence) — full checklist in **`docs/arm64-port.md`**. Local-LLM caveat: no working Vulkan/Adreno GPU on Windows ARM, so on that machine the (optional) local transform is CPU-only ~12–18 tok/s; transcription stays native + fast.

**Still open:** real `tauri build` bundling per target / in CI; mac/linux fetch branch + Metal; live forced GPU→CPU fallback test; the ARM64 port itself (run when the machine lands).
