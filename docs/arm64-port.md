# Steno on Windows ARM64 (Snapdragon) — Porting Plan

**Target machine:** Lenovo Yoga Slim 7x — Snapdragon **X2 Elite** (Qualcomm Oryon, ARM64),
32 GB LPDDR5X, Adreno iGPU, Windows 11 ARM64.

**Goal:** a **native** `aarch64-pc-windows-msvc` build of Steno (not x64-under-emulation).
The existing x64 build *runs* under Windows-on-ARM emulation (Prism) but loses speed and GPU
access; every component Steno needs has a native ARM64 path, so a proper rebuild is worth it.

**Intended deployment:** **cloud transform + local transcription.** That sidesteps this
machine's only real weakness (no usable local-LLM GPU): the sole on-device AI workload becomes
Parakeet transcription, which runs natively and fast on the ARM64 CPU. Fully-local still works,
CPU-only, but is slower (see Performance).

> Verdict from the 2026-06-22 research pass: **High confidence** the native ARM64 port succeeds
> for the cloud-transform path. The risks are all *configuration/toolchain*, not *capability* —
> nothing in the stack is fundamentally blocked on Windows ARM64.

---

## Component status

| Component | Native ARM64 | Notes |
|---|---|---|
| Rust target `aarch64-pc-windows-msvc` | ✅ Tier 1 w/ host tools (Rust ≥ 1.91) | rustup provides std; builds on-device |
| Tauri 2 | ✅ | **NSIS** bundler only (`--bundles nsis`); MSI/WiX not ARM64 |
| WebView2 runtime | ✅ | ARM64 Evergreen pre-installed on Win11 ARM |
| Transcription — `transcribe-rs` 0.2.1 (`parakeet`) → ONNX Runtime via `ort` | ✅ CPU | `ort` auto-downloads a win-arm64 **CPU** lib; parakeet pulls only portable crates. No NPU/QNN without a source build (not needed). |
| `cpal` 0.16 (mic capture) | ✅ | WASAPI loopback has an ARM quirk; plain mic capture is fine |
| `rdev` 0.5 (global hotkeys) | ✅ | via winapi 0.3.9+; smoke-test it |
| `enigo` 0.5 (paste-at-cursor) | ✅ | windows 0.62 bindings |
| `windows-sys` 0.59, `reqwest`/`tokio`, `hound`, `rubato` | ✅ | first-party / pure-Rust |
| Cloud transform (`tauri-plugin-http` / reqwest) | ✅ | network only |
| VAD (`@ricky0123/vad-web`) | ✅ | WASM inside WebView2 — arch-independent |
| ffmpeg | ✅ | native win-arm64 builds exist (tordona) **or** Steno's pure-Rust `rubato` fallback |
| Local LLM — bundled llama.cpp `llama-server` | ⚠️ **CPU only** | `win-cpu-arm64` exists; **no `win-vulkan-arm64`**, and Adreno GPU on Windows is broken/experimental. ~12–18 tok/s for Qwen3-8B Q4_K_M. |
| Wakeword (voice activation) | ⚠️ optional | a **Python** sidecar, not a bundled binary — see below |

---

## The one real build gotcha: `ring` needs LLVM/Clang

`ring` (transitive via Tauri/reqwest's TLS stack; `ring 0.17.x` + `rustls 0.23` are in `Cargo.lock`)
ships precompiled asm only for x86/x64 Windows. For `aarch64-pc-windows-msvc` it must compile its
C/asm at build time and therefore needs **Clang/LLVM on the build machine**. This is the single
most-cited Windows-ARM64 Tauri build failure. It is a **build-environment** requirement, not a
runtime blocker — install LLVM and it compiles.

---

## Porting checklist (run when the machine lands)

Do this **on the device** (or on a Windows-ARM64 CI runner — GitHub offers them in public preview)
to avoid cross-compile header pain. Note the fetch script keys off `process.arch`, so it picks the
arm64 assets correctly only when run on the ARM64 machine.

1. **Toolchain**
   - Install **Visual Studio 2022** with "**MSVC v143 — VS 2022 C++ ARM64 build tools**".
   - Install **LLVM/Clang** and put it on `PATH` (for `ring`).
   - `rustup target add aarch64-pc-windows-msvc` (or just run rustup on-device).
   - Install **Bun** (ARM64) and **Python** (ARM64, only if using wakeword).

2. **llama.cpp fetch** — already fixed (see below). `bun run fetch-llama-server` will pull
   `llama-...-bin-win-cpu-arm64.zip` into `binaries/cpu/`, satisfying the `binaries/*/*` bundle glob.
   (Set `LLAMA_CPP_VARIANT=opencl-adreno,cpu` only if you want to experiment with the Adreno GPU build.)

3. **ffmpeg** (optional — there's a pure-Rust `rubato` fallback). If bundling, grab the native
   **tordona** static win-arm64 build (`ffmpeg-<ver>-essentials-static-win-arm64`) and point the app at it.

4. **Build & bundle**
   ```sh
   bun install
   bun run fetch-llama-server          # auto-runs in beforeBuildCommand
   bun run tauri build --target aarch64-pc-windows-msvc --bundles nsis
   ```

5. **First-prod data dir** — remember the dev/prod identifier split (`io.steno.app.dev` vs
   `io.steno.app`): build → install (don't launch) → `bun run migrate-dev-data` → launch.
   (See the local-model-stack notes.)

6. **On-device smoke test** (the real validation):
   - [ ] App launches; tray works; window shows.
   - [ ] **Transcription** end-to-end: record → Parakeet transcript → clipboard + paste (the core path).
   - [ ] `cpal` mic capture, `rdev` global hotkey, `enigo` paste all work.
   - [ ] **Cloud transform**: a transformation completes via Anthropic.
   - [ ] (If wanted) **local transform**: Qwen3-8B on CPU produces output (slow but works).

---

## Performance expectations (X2 Elite, native ARM64)

- **Transcription (Parakeet, ONNX CPU):** native and fast — RTFx is very high and the model is
  light. Effectively instant for normal utterances. (Native ARM64 is dramatically faster than
  x64-emulated — build native.)
- **Cloud transform:** network-bound, identical to any platform.
- **Local transform (if used):** **CPU-only**, ~12–18 tok/s for Qwen3-8B Q4_K_M
  (~16–25 tok/s if you ship **Q4_0**, which auto-repacks for ARM i8mm). Fine for short grammar
  fixes with thinking off (~1–2 s); sluggish for long rewrites. **No GPU acceleration** —
  llama.cpp has no working Vulkan/Adreno path on Windows ARM. This is why cloud transform is the
  recommended mode on this machine.

---

## Wakeword (optional feature)

`src-tauri/src/wakeword.rs` spawns a **Python** sidecar (`Command::new("python")`), not a bundled
native binary. To use voice-activation on ARM64 you'd need Python-ARM64 plus the script's deps
(likely openWakeWord + onnxruntime-python — verify win-arm64 wheels exist). **Not required for core
dictation** (push-to-talk / toggle hotkeys), so it can be deferred or left disabled for the first port.

---

## Already done (this commit)

`scripts/fetch-llama-server.ts` — the default variant list is now arch-aware: Windows ARM64 fetches
`cpu` (not the nonexistent `vulkan` asset). x64 Windows/Linux and macOS are unchanged.

---

## Sources (2026-06-22 research)

- ONNX Runtime official win-arm64 binaries since v1.7.0 — github.com/microsoft/onnxruntime/releases
- `ort` crate win-arm64 CPU prebuilt (`dist.txt`) — github.com/pykeio/ort
- Rust `aarch64-pc-windows-msvc` Tier 1 — doc.rust-lang.org/rustc/platform-support.html
- Tauri Windows ARM64 (NSIS) — v2.tauri.app/distribute/windows-installer/
- WebView2 ARM64 — learn.microsoft.com/microsoft-edge/webview2/concepts/distribution
- llama.cpp releases (no `win-vulkan-arm64`; `win-cpu-arm64` + `win-opencl-adreno-arm64`) — github.com/ggml-org/llama.cpp/releases ; OpenCL/Adreno backend docs/build.md ; Vulkan-on-Adreno broken: issues #8455, #6395
- CPU 8B Q4 benchmarks on Snapdragon X — github.com/ggml-org/llama.cpp/discussions/8273, #8336
- `ring` needs Clang on ARM64 — github.com/briansmith/ring + tauri-apps/tauri#9758
- Native win-arm64 ffmpeg — github.com/tordona/ffmpeg-win-arm64
