# x86 + RTX GPU golden baseline (ARM64-port Phase 0)

Protection contract that lets us add a Windows-ARM64 build **without diminishing**
the x86_64 + NVIDIA RTX workstation stack (Parakeet FP32 transcription + Qwen3-8B
transform on the bundled Vulkan `llama-server`). Captured **2026-07-09** on the RTX
PRO 5000 workstation, before any ARM64 work.

## What it freezes

| Anchor | Value / location |
|---|---|
| Pinned llama.cpp release | **`b9628`** — `scripts/fetch-llama-server.ts` `PINNED_LLAMA_CPP_RELEASE` (was `latest`) |
| Bundled engine hashes | SHA-256 of every `binaries/vulkan/*` + `binaries/cpu/*` DLL — `scripts/x86-golden-baseline.json` |
| Shared lockfiles | `Cargo.lock` + root `bun.lock` SHA-256 — same JSON |
| GPU benchmark-of-record | **97 tok/s** generation, Qwen3-8B Q4_K_M, `-ngl 99`, `Vulkan0 = NVIDIA RTX PRO 5000` |

The oracle is **deterministic checks + the live GPU benchmark — never installer
byte-equality** (NSIS/MSI installers are not byte-reproducible).

## Why the pin matters

`tauri.conf.json`'s `beforeBuildCommand` runs `fetch-llama-server` on **every**
build. It used to default to `latest`, so the x86 Vulkan engine (the ~42–97 tok/s
path) could silently change with **no source diff**. Pinning `b9628` closes that.

## The guard: `bun test scripts/x86-baseline-guard.test.ts`

Run before shipping an x86 build, or after any refactor near build config. It turns
every "silently diminish x86" hazard into a RED test, parsing **values** (resilient
to formatting) and shipping **self-tests that prove each check bites**:

- `tauri.conf.json` `bundle.targets` stays `"all"` (x86 keeps MSI + NSIS); `binaries` glob intact
- `settings.ts` `llamacpp.gpuLayers` default stays **99** (offload Qwen3-8B → RTX)
- `settings.ts` `completion.provider` default stays `'llamacpp'`
- `llama_server.rs` `BUNDLED_VARIANTS` stays **vulkan-first** + includes `cpu`
- `Cargo.toml` `transcribe-rs` gates stay **OS-based** (`parakeet`-only on `cfg(windows)`; whisper+parakeet+moonshine on non-windows) — so Windows-on-ARM inherits the right config
- `fetch-llama-server.ts`: x64 → `[vulkan, cpu]`, win-arm64 → `[cpu]` (two branches, not collapsed)
- llama.cpp release is pinned (never `latest`)
- bundled DLL + lockfile hashes match the baseline (skipped if `binaries/` not fetched)

The three x86 "levers" (`targets:"all"`, `gpuLayers=99`, `vulkan`-first order) are
**never edited** by the ARM port — ARM diverges only via CLI flags
(`--target aarch64-pc-windows-msvc --bundles nsis`) and the per-machine, gitignored
contents of `binaries/`.

## Re-baselining (after a deliberate change)

Only when you **intentionally** bump the llama.cpp pin or change dependencies:

```sh
# on the x86 workstation, after the deliberate change:
bun run scripts/capture-x86-baseline.ts     # rewrites x86-golden-baseline.json
# then re-measure the GPU benchmark by hand and update benchmarkOfRecord:
#   binaries/vulkan/llama-server.exe -m <Qwen3-8B GGUF> -ngl 99 --port 18099
#   curl :18099/completion -d '{"prompt":"...","n_predict":128,"temperature":0}'
#   -> read timings.predicted_per_second
bun test scripts/x86-baseline-guard.test.ts # confirm green
```

## Files

- `apps/steno/scripts/fetch-llama-server.ts` — pin + pure exported `defaultNonDarwinVariants(platform, arch)`
- `apps/steno/scripts/x86-golden-baseline.json` — the recorded baseline
- `apps/steno/scripts/capture-x86-baseline.ts` — regenerates the baseline
- `apps/steno/scripts/x86-baseline-guard.test.ts` — the guard + self-tests

## Phase 0 gate — COMPLETE (2026-07-09)

The full `bun run tauri build` on this workstation ran clean: **MSI + NSIS both emit**
(`Steno_7.11.0_x64_en-US.msi` ~67 MB, `Steno_7.11.0_x64-setup.exe` ~48 MB) and the
pinned `b9628` fetch integrated. `bun test scripts/x86-baseline-guard.test.ts` is
green (**17 pass / 0 fail**). Everything else (pin, hashes, live GPU benchmark, guard +
self-tests) was already done — **Phase 0 is fully complete.**
