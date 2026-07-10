/**
 * Captures the x86 + RTX-GPU "golden baseline" for Steno into
 * `scripts/x86-golden-baseline.json` — the reproducibility anchor the x86
 * invariant-guard test (`x86-baseline-guard.test.ts`) checks against.
 *
 * What it records (all reproducible from the pinned llama.cpp release):
 *   - the pinned upstream release tag (from fetch-llama-server.ts)
 *   - SHA-256 of every bundled llama-server / ggml DLL in binaries/vulkan + cpu
 *   - SHA-256 of the shared Cargo.lock and root bun.lock
 *
 * The `benchmarkOfRecord` block (live GPU tok/s) is NOT auto-captured — it needs
 * a running inference — so an existing block is PRESERVED across re-runs. Update
 * it by hand after re-measuring (spawn binaries/vulkan/llama-server.exe -ngl 99
 * against the Qwen3-8B GGUF and read timings.predicted_per_second).
 *
 * Run after a DELIBERATE llama.cpp pin bump or dependency change, on the x86 box:
 *   bun run scripts/capture-x86-baseline.ts
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PINNED_LLAMA_CPP_RELEASE } from './fetch-llama-server.ts';

const STENO = resolve(import.meta.dir, '..');
const REPO_ROOT = resolve(STENO, '..', '..');
const BINARIES = join(STENO, 'src-tauri', 'binaries');
const OUT = join(import.meta.dir, 'x86-golden-baseline.json');

const sha256 = (p: string) =>
	createHash('sha256').update(readFileSync(p)).digest('hex');

/** Hash every file in binaries/<variant>/, keyed "<variant>/<file>". */
function hashBundle(): Record<string, string> {
	const out: Record<string, string> = {};
	for (const variant of ['vulkan', 'cpu']) {
		const dir = join(BINARIES, variant);
		if (!existsSync(dir)) {
			throw new Error(
				`binaries/${variant} not found — run \`bun run fetch-llama-server\` on this x86 box first.`,
			);
		}
		for (const name of readdirSync(dir).sort()) {
			out[`${variant}/${name}`] = sha256(join(dir, name));
		}
	}
	return out;
}

const prev = existsSync(OUT)
	? JSON.parse(readFileSync(OUT, 'utf8'))
	: {};

const baseline = {
	_comment:
		'x86 + RTX GPU golden baseline. Regenerate with scripts/capture-x86-baseline.ts after a deliberate llama.cpp pin bump or dep change. benchmarkOfRecord is hand-maintained.',
	pinnedLlamaCppRelease: PINNED_LLAMA_CPP_RELEASE,
	dllHashes: hashBundle(),
	cargoLockSha256: sha256(join(STENO, 'src-tauri', 'Cargo.lock')),
	bunLockSha256: sha256(join(REPO_ROOT, 'bun.lock')),
	// Preserved across re-runs; update by hand after re-measuring on the GPU box.
	benchmarkOfRecord: prev.benchmarkOfRecord ?? {
		note: 'TODO: measure live and fill in.',
	},
};

writeFileSync(OUT, `${JSON.stringify(baseline, null, 2)}\n`);
console.log(
	`[capture-x86-baseline] wrote ${OUT}\n` +
		`  pinned release: ${baseline.pinnedLlamaCppRelease}\n` +
		`  bundled DLLs hashed: ${Object.keys(baseline.dllHashes).length}\n` +
		`  Cargo.lock: ${baseline.cargoLockSha256.slice(0, 12)}…  bun.lock: ${baseline.bunLockSha256.slice(0, 12)}…`,
);
