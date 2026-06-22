# Cloud Transformation Provider (opt-in)

**Date:** 2026-06-14
**Status:** Implemented; typecheck green (0 errors), lint clean for changed files. Runtime validation still pending (needs a real API key + running app). See "Remaining".

## Context

Companion to the local model stack (`20260610T053000-local-model-stack-upgrade.md`). An architecture review asked whether hosting models in the cloud would hurt the product. Conclusion that drove this work:

- **Transcription must stay local.** It's the latency-critical, always-on, privacy-sensitive path: text delivery (paste-at-cursor) and voice-command matching both block on it. Cloud would add ~1–3s per utterance, break offline use, and send confidential audio off-device — with no upside, since Parakeet 0.6B runs effectively free locally (RTFx ~3332).
- **Transformation is a good cloud candidate.** It's opt-in (only runs when a transformation is selected), off the hot path, latency-tolerant, text-only, and a hosted model is typically faster + higher quality than local Qwen3-8B. Costs: the transcript text leaves the device, and it needs connectivity.

So: keep transcription local, add an **opt-in** cloud backend for the transformation step only.

**Provider choice — Anthropic, Claude Haiku 4.5 default.** Chosen for this workload (high-volume, latency-sensitive, executive-confidential text cleanup): strongest data-handling posture (no training on API data by default; ZDR available), fast/cheap Haiku tier ($1/$5 per MTok), and an OpenAI-compatible `/chat/completions` endpoint that drops straight into one adapter. Sonnet 4.6 is the heavier-rewrite option. Groq is the latency-first runner-up but weaker on the privacy story. Model ids: `claude-haiku-4-5` (default), `claude-sonnet-4-6`.

## Design decisions

1. **One OpenAI-compatible adapter, not per-provider.** A single `cloud.ts` covers Anthropic / OpenAI / Groq / OpenRouter / Custom via a base-URL preset map + Bearer auth. (Native Anthropic Messages / Gemini APIs are out of scope — a possible fast-follow.)
2. **No streaming.** Matches the existing `stream: false` local clients; output awaited whole.
3. **Privacy guardrail is mandatory + opt-in.** Off by default; selecting Cloud shows an explicit notice that transcript text leaves the device.
4. **Opt-in offline fallback.** `completion.cloudFallbackToLocal` (default **off**). When on, only **connectivity** failures fall back to the bundled local model; auth/rate-limit errors always surface so a bad key/quota isn't masked. Implemented via a structured `CloudCompletionError { message, offline }`.

## What changed

### New files
- `src/lib/constants/inference/cloud-presets.ts` — `CLOUD_PRESETS` (Anthropic/OpenAI/Groq/OpenRouter/Custom) with `baseUrl`, `apiKeyField` (existing `apiKeys.*`), `defaultModel`; plus `CLOUD_PRESET_IDS` / `CLOUD_PRESET_OPTIONS`. Anthropic + `claude-haiku-4-5` default.
- `src/lib/services/isomorphic/completion/cloud.ts` — `CloudCompletionServiceLive.complete()`: OpenAI `/chat/completions` + `Authorization: Bearer`. Returns `Result<string, CloudCompletionError>`; classifies 401/403 (auth), 429 (rate limit), and connection failures (`offline: true`).

### Edits
- `src/lib/services/isomorphic/completion/index.ts` — exports `CloudCompletionServiceLive` (auto-registers under `services.completions`, which is just the namespace re-export of `./completion`).
- `src/lib/settings/settings.ts` — `completion.provider` enum extended to include `'cloud'`; added `completion.cloudFallbackToLocal` (bool, default false), `cloud.provider` (preset id, default `Anthropic`), `cloud.model` (default `claude-haiku-4-5`), `cloud.baseUrl` (Custom only), `cloud.defaultPrompt`. Reuses existing `apiKeys.*` — no new key storage.
- `src/lib/query/isomorphic/transformer.ts` — `prompt_transform` case: extracted the llama.cpp path into a reusable `runLlamaCpp()`; added the `provider === 'cloud'` branch (resolve preset → base URL → `apiKeys.*` key → call cloud service; on offline error + toggle on, fall back to `runLlamaCpp()`). Default-prompt selection now three-way. Imports `CLOUD_PRESETS`.
- `src/routes/(app)/(config)/settings/transformation/+page.svelte` — added `Cloud (OpenAI-compatible)` to `PROVIDER_OPTIONS`; new Cloud block with privacy notice, provider preset `Select` (seeds `cloud.model` on switch), Custom base-URL input, password API-key input bound to the preset's `apiKeys.*`, a **Test** button (`testCloud()` does a 1-shot ping), the fallback toggle, and a default-prompt textarea. Restructured the `llamacpp / {:else if ollama} / {:else cloud}` branches.

## Verification done
- `bun run typecheck` (`svelte-kit sync && svelte-check`) → **2001 files, 0 errors, 0 warnings.**
- Lint: changed files clean. (The 6 `bun run lint` errors are pre-existing `@typescript-eslint` rule-resolution failures in generated `.svelte-kit/output/server/` artifacts — unrelated.)
- Local `llamacpp`/`ollama` paths unchanged; transcription untouched (stays local).

## Remaining (to close out)
Runtime validation — needs a real API key + `bun run dev`:
1. Backend → Cloud, enter an Anthropic key, **Test** → expect "responded".
2. Run a grammar-fix transformation end-to-end; confirm corrected text is delivered/pasted.
3. Negative paths: empty key → friendly error; offline with toggle **off** → "couldn't reach provider"; toggle **on** → silently completes on the local model; 401 with toggle on → still surfaces (no silent fallback).
4. Confirm preset-switch seeding of `cloud.model` behaves and the password field binds to the right `apiKeys.*` per preset.

Optional fast-follows (not started): native Anthropic adapter (prompt caching / adaptive thinking) instead of the OpenAI-compat layer; native Gemini; cloud as a per-transformation-step override (not just a global default).
