/**
 * x86 + RTX-GPU non-regression guard (`bun test scripts/x86-baseline-guard.test.ts`).
 *
 * Run this on the x86 workstation before shipping an x86 build (and after any
 * refactor that touches build config). It converts every "silently diminish the
 * x86 GPU stack" hazard from the ARM64 port plan into a RED test:
 *
 *   - tauri.conf.json bundle.targets must stay "all"  (x86 keeps MSI + NSIS)
 *   - tauri.conf.json resources must keep the bundled "binaries" glob
 *   - settings.ts llamacpp.gpuLayers default must stay 99  (offload Qwen3-8B → RTX)
 *   - settings.ts completion.provider default must stay 'llamacpp'
 *   - llama_server.rs BUNDLED_VARIANTS must stay vulkan-first + include cpu
 *   - Cargo.toml transcribe-rs OS gates: parakeet-only on windows; whisper+
 *     parakeet+moonshine on non-windows (OS-gated, NOT arch-gated → WoA inherits)
 *   - fetch-llama-server.ts: x64 → [vulkan,cpu], win-arm64 → [cpu] (two branches)
 *   - the llama.cpp release is PINNED (never "latest")
 *
 * Each invariant is a pure checker fed the REAL file plus a MUTATED copy, so the
 * self-tests prove the checker actually bites (a defanged guard is worse than
 * none). Value-based parsing (not line numbers) keeps it resilient to formatting
 * and harmless refactors, so it won't falsely block a legitimate x86 release.
 *
 * The golden artifact hashes (bundled DLLs + lockfiles) are verified only when
 * binaries/ has been fetched on this machine; otherwise those cases are skipped.
 */

import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
	defaultNonDarwinVariants,
	PINNED_LLAMA_CPP_RELEASE,
} from './fetch-llama-server.ts';

const STENO = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(STENO, '..', '..');
const read = (p: string) => readFileSync(p, 'utf8');
const sha256 = (p: string) =>
	createHash('sha256').update(readFileSync(p)).digest('hex');

const CONF = read(join(STENO, 'src-tauri/tauri.conf.json'));
const SETTINGS = read(join(STENO, 'src/lib/settings/settings.ts'));
const RUST = read(join(STENO, 'src-tauri/src/llama_server.rs'));
const CARGO = read(join(STENO, 'src-tauri/Cargo.toml'));
const BASELINE = JSON.parse(read(join(import.meta.dir, 'x86-golden-baseline.json')));

// ---- pure invariant checkers (throw on a diminishing value) ----

function checkBundleTargets(confText: string) {
	const conf = JSON.parse(confText);
	if (conf.bundle?.targets !== 'all')
		throw new Error(
			`bundle.targets must be "all" (x86 ships MSI+NSIS); got ${JSON.stringify(conf.bundle?.targets)}. Use --bundles nsis on the CLI for ARM, never edit config.`,
		);
	if (!conf.bundle?.resources?.includes('binaries/*/*'))
		throw new Error('bundle.resources must include "binaries/*/*"');
}

function checkGpuLayers(settingsText: string) {
	const m = settingsText.match(/'llamacpp\.gpuLayers':\s*'number = (\d+)'/);
	if (!m) throw new Error('could not find the llamacpp.gpuLayers default');
	if (Number(m[1]) !== 99)
		throw new Error(
			`llamacpp.gpuLayers default must be 99 (offload all Qwen3-8B layers to the RTX GPU); got ${m[1]}`,
		);
}

function checkCompletionProvider(settingsText: string) {
	const m = settingsText.match(/'completion\.provider':\s*"[^"]*=\s*'([\w-]+)'"/);
	if (!m) throw new Error('could not find the completion.provider default');
	if (m[1] !== 'llamacpp')
		throw new Error(
			`completion.provider default must be 'llamacpp' (local GPU transform); got '${m[1]}'`,
		);
}

function checkBundledVariants(rustText: string) {
	const m = rustText.match(
		/const BUNDLED_VARIANTS:\s*&\[&str\]\s*=\s*&\[([^\]]*)\]/,
	);
	if (!m) throw new Error('could not find BUNDLED_VARIANTS');
	const variants = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
	if (variants[0] !== 'vulkan')
		throw new Error(
			`BUNDLED_VARIANTS must start with "vulkan" so x86 tries the RTX GPU build first; got [${variants}]`,
		);
	if (!variants.includes('cpu'))
		throw new Error('BUNDLED_VARIANTS must include a "cpu" fallback');
}

function transcribeFeatures(cargoText: string, cfg: string): string[] {
	const re = new RegExp(
		`\\[target\\.'cfg\\(${cfg}\\)'\\.dependencies\\][\\s\\S]*?transcribe-rs = \\{[^}]*features = \\[([^\\]]*)\\]`,
	);
	const m = cargoText.match(re);
	if (!m) throw new Error(`could not find transcribe-rs under cfg(${cfg})`);
	return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function checkTranscribeGates(cargoText: string) {
	const win = transcribeFeatures(cargoText, 'windows');
	const notWin = transcribeFeatures(cargoText, 'not\\(windows\\)');
	if (!(win.length === 1 && win[0] === 'parakeet'))
		throw new Error(
			`Windows transcribe-rs must be parakeet-only (whisper/moonshine don't build on Windows, x64 OR arm64); got [${win}]`,
		);
	for (const f of ['whisper', 'parakeet', 'moonshine'])
		if (!notWin.includes(f))
			throw new Error(`non-Windows transcribe-rs must include ${f}; got [${notWin}]`);
}

// ---- the guard: real source must satisfy every invariant ----

describe('x86 + RTX GPU invariant guard', () => {
	test('bundle.targets = "all" and binaries/*/* resource', () =>
		expect(() => checkBundleTargets(CONF)).not.toThrow());
	test('llamacpp.gpuLayers default = 99', () =>
		expect(() => checkGpuLayers(SETTINGS)).not.toThrow());
	test("completion.provider default = 'llamacpp'", () =>
		expect(() => checkCompletionProvider(SETTINGS)).not.toThrow());
	test('BUNDLED_VARIANTS vulkan-first + cpu fallback', () =>
		expect(() => checkBundledVariants(RUST)).not.toThrow());
	test('transcribe-rs OS gates intact (parakeet-only on windows)', () =>
		expect(() => checkTranscribeGates(CARGO)).not.toThrow());
	test('fetch variants: x64 = [vulkan,cpu], win-arm64 = [cpu]', () => {
		expect(defaultNonDarwinVariants('win32', 'x64')).toEqual(['vulkan', 'cpu']);
		expect(defaultNonDarwinVariants('linux', 'x64')).toEqual(['vulkan', 'cpu']);
		expect(defaultNonDarwinVariants('win32', 'arm64')).toEqual(['cpu']);
	});
	test('llama.cpp release is pinned (never "latest")', () => {
		expect(PINNED_LLAMA_CPP_RELEASE).not.toBe('latest');
		expect(PINNED_LLAMA_CPP_RELEASE).toBe(BASELINE.pinnedLlamaCppRelease);
	});
	test('GPU benchmark-of-record captured (GPU-class tok/s)', () => {
		expect(BASELINE.benchmarkOfRecord?.variant).toBe('vulkan');
		expect(BASELINE.benchmarkOfRecord?.generationTokPerSec).toBeGreaterThan(40);
	});
});

// ---- self-tests: every checker MUST reject a diminishing edit ----

describe('guard self-test (each invariant flip → RED)', () => {
	test('targets flipped "all"→"nsis" is caught', () =>
		expect(() =>
			checkBundleTargets(CONF.replace('"targets": "all"', '"targets": "nsis"')),
		).toThrow());
	test('binaries/*/* resource removed is caught', () =>
		expect(() =>
			checkBundleTargets(CONF.replace('"binaries/*/*"', '"nope/*/*"')),
		).toThrow());
	test('gpuLayers lowered 99→0 is caught', () =>
		expect(() =>
			checkGpuLayers(
				SETTINGS.replace(
					"'llamacpp.gpuLayers': 'number = 99'",
					"'llamacpp.gpuLayers': 'number = 0'",
				),
			),
		).toThrow());
	test('provider default flipped llamacpp→cloud is caught', () =>
		expect(() =>
			checkCompletionProvider(SETTINGS.replace("= 'llamacpp'\"", "= 'cloud'\"")),
		).toThrow());
	test('BUNDLED_VARIANTS reordered cpu-first is caught', () =>
		expect(() =>
			checkBundledVariants(
				RUST.replace('&["vulkan", "metal", "cpu"]', '&["cpu", "vulkan", "metal"]'),
			),
		).toThrow());
	test('vulkan dropped from BUNDLED_VARIANTS is caught', () =>
		expect(() =>
			checkBundledVariants(RUST.replace('&["vulkan", "metal", "cpu"]', '&["metal", "cpu"]')),
		).toThrow());
	test('windows transcribe-rs gaining whisper is caught', () =>
		expect(() =>
			checkTranscribeGates(
				CARGO.replace('features = ["parakeet"]', 'features = ["parakeet", "whisper"]'),
			),
		).toThrow());
});

// ---- golden artifact hashes (only when binaries/ fetched on this machine) ----

const haveBundle = existsSync(join(STENO, 'src-tauri/binaries/vulkan/llama-server.exe'));

describe('x86 golden artifact hashes (pinned llama.cpp)', () => {
	test.skipIf(!haveBundle)('bundled llama-server/ggml DLL hashes match baseline', () => {
		for (const [rel, want] of Object.entries<string>(BASELINE.dllHashes)) {
			const p = join(STENO, 'src-tauri/binaries', rel);
			expect(existsSync(p), `${rel} missing`).toBe(true);
			expect(sha256(p), `${rel} changed vs golden — re-baseline only if the pin bump was deliberate`).toBe(want);
		}
	});
	test.skipIf(!haveBundle)('Cargo.lock + bun.lock hashes unchanged', () => {
		expect(sha256(join(STENO, 'src-tauri/Cargo.lock'))).toBe(BASELINE.cargoLockSha256);
		expect(sha256(join(REPO_ROOT, 'bun.lock'))).toBe(BASELINE.bunLockSha256);
	});
});
