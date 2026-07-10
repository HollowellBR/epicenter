/**
 * Fetches the prebuilt llama.cpp `llama-server` binary (or binaries) for the
 * current platform and installs each into a per-variant subdirectory under
 * `src-tauri/binaries/<variant>/`, where `tauri.conf.json` bundles them as
 * resources and `src/llama_server.rs` resolves them at runtime.
 *
 * Multiple variants are fetched so the app can prefer a GPU build and fall back
 * to CPU at runtime (see `llama_server.rs::resolve_server_candidates`):
 *   - Windows/Linux: `vulkan` (GPU, vendor-agnostic) + `cpu` (guaranteed fallback)
 *   - macOS:         the universal `metal` build (GPU + CPU fallback built in)
 *
 * Runs automatically before `tauri build` (see `beforeBuildCommand`), and can be
 * run manually: `bun run fetch-llama-server` (add `--force` to re-download).
 *
 * Env overrides:
 *   LLAMA_CPP_RELEASE  release tag to fetch (default: "latest"), e.g. "b9585"
 *   LLAMA_CPP_VARIANT  comma-separated variant list, overrides the per-platform
 *                      default (e.g. "vulkan,cpu", "cuda-12.4", "cpu"). Ignored
 *                      on macOS, which only ships a single universal build.
 *   GITHUB_TOKEN       optional, raises GitHub API rate limits in CI
 */

import { execFileSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const REPO = 'ggml-org/llama.cpp';
// Pinned to an EXACT upstream llama.cpp release so the bundled engine — and the
// x86 Vulkan GPU llama-server in particular — can never silently change with no
// source diff (beforeBuildCommand re-fetches on every build). Bump this
// deliberately, then re-run `bun run scripts/capture-x86-baseline.ts` to refresh
// the x86 golden baseline. `LLAMA_CPP_RELEASE` still overrides at runtime.
export const PINNED_LLAMA_CPP_RELEASE = 'b9628';
const RELEASE = process.env.LLAMA_CPP_RELEASE ?? PINNED_LLAMA_CPP_RELEASE;
const FORCE = process.argv.includes('--force');

// macOS ships one universal build (Metal + CPU). Windows/Linux get a GPU build
// (Vulkan: works on NVIDIA/AMD/Intel) plus a plain CPU build as a safe fallback.
// Default GPU+CPU variant list for Windows/Linux (macOS is handled separately).
// Pure + exported so the x86 invariant-guard test can assert BOTH branches
// directly (x64 keeps the Vulkan GPU build; win-arm64 gets cpu-only) without
// re-implementing the logic. Callers pass process.platform/process.arch.
export function defaultNonDarwinVariants(
	platform: string,
	arch: string,
): string[] {
	// Windows on ARM64 (Snapdragon / Adreno): llama.cpp publishes NO win-vulkan
	// arm64 asset, and Vulkan on Adreno/Windows is broken anyway, so ship the
	// reliable CPU build. (The arm64 GPU build is `opencl-adreno`, but it's
	// experimental and often loses to CPU on Snapdragon X — opt in explicitly via
	// LLAMA_CPP_VARIANT=opencl-adreno,cpu if you want to try it.)
	if (platform === 'win32' && arch === 'arm64') return ['cpu'];
	// Windows / Linux x64: Vulkan GPU build (NVIDIA/AMD/Intel) + CPU fallback.
	return ['vulkan', 'cpu'];
}

const VARIANTS: string[] =
	process.platform === 'darwin'
		? ['metal']
		: (process.env.LLAMA_CPP_VARIANT?.split(',')
				.map((s) => s.trim())
				.filter(Boolean) ?? defaultNonDarwinVariants(process.platform, process.arch));

const BINARIES_DIR = resolve(import.meta.dir, '../src-tauri/binaries');
const isWindows = process.platform === 'win32';
const serverName = isWindows ? 'llama-server.exe' : 'llama-server';

function log(msg: string) {
	console.log(`[fetch-llama-server] ${msg}`);
}

/** Build a regex that matches the release asset for this platform/arch/variant. */
function assetPattern(variant: string): RegExp {
	const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
	switch (process.platform) {
		case 'win32':
			// e.g. llama-b9585-bin-win-vulkan-x64.zip
			return new RegExp(`bin-win-${variant}-${arch}\\.zip$`);
		case 'darwin':
			// e.g. llama-b9585-bin-macos-arm64.tar.gz (Metal included; no variant)
			return new RegExp(`bin-macos-${arch}\\.tar\\.gz$`);
		case 'linux': {
			// CPU build has no variant segment: llama-...-bin-ubuntu-x64.tar.gz
			const seg = variant && variant !== 'cpu' ? `${variant}-` : '';
			return new RegExp(`bin-ubuntu-${seg}${arch}\\.tar\\.gz$`);
		}
		default:
			throw new Error(`Unsupported platform: ${process.platform}`);
	}
}

async function gh(path: string): Promise<any> {
	const headers: Record<string, string> = {
		'User-Agent': 'steno-fetch-llama-server',
		Accept: 'application/vnd.github+json',
	};
	if (process.env.GITHUB_TOKEN) {
		headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	}
	const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
		headers,
	});
	if (!res.ok) {
		throw new Error(`GitHub API ${path} returned ${res.status} ${res.statusText}`);
	}
	return res.json();
}

/** Recursively find the directory that contains the llama-server binary. */
function findServerDir(root: string): string | null {
	const entries = readdirSync(root, { withFileTypes: true });
	if (entries.some((e) => e.isFile() && e.name === serverName)) return root;
	for (const e of entries) {
		if (e.isDirectory()) {
			const found = findServerDir(join(root, e.name));
			if (found) return found;
		}
	}
	return null;
}

type Asset = { name: string; browser_download_url: string };

/** Download, extract, prune, and install one variant into `binaries/<variant>/`. */
async function installVariant(release: any, tag: string, variant: string) {
	const destDir = join(BINARIES_DIR, variant);
	if (existsSync(join(destDir, serverName)) && !FORCE) {
		log(`${variant}/${serverName} already present — skipping (use --force to re-download).`);
		return;
	}

	const pattern = assetPattern(variant);
	const asset = (release.assets as Asset[]).find((a) => pattern.test(a.name));
	if (!asset) {
		const names = (release.assets as Asset[]).map((a) => a.name).join('\n  ');
		throw new Error(
			`No asset matching ${pattern} for variant "${variant}" in release ${tag}. ` +
				`Available assets:\n  ${names}\n` +
				`Adjust LLAMA_CPP_VARIANT (e.g. "vulkan,cpu", "cuda-12.4").`,
		);
	}

	log(`downloading ${asset.name} (variant ${variant}, release ${tag})`);
	const tmp = mkdtempSync(join(tmpdir(), 'llama-server-'));
	const archivePath = join(tmp, asset.name);

	try {
		const res = await fetch(asset.browser_download_url);
		if (!res.ok) {
			throw new Error(`Download failed: ${res.status} ${res.statusText}`);
		}
		// Buffer then write: Bun.write(path, Response) can hang on streamed bodies.
		const bytes = new Uint8Array(await res.arrayBuffer());
		await Bun.write(archivePath, bytes);

		log('extracting…');
		if (archivePath.endsWith('.zip')) {
			// Windows assets are .zip. Use .NET ZipFile (always present) — the
			// `tar` on PATH may be GNU tar (can't read zips, mis-parses `C:`), and
			// the Expand-Archive module isn't always loadable. Extract into a fresh
			// subdir so it doesn't collide with the downloaded archive.
			const extractTo = join(tmp, 'extracted');
			execFileSync(
				'powershell',
				[
					'-NoProfile',
					'-NonInteractive',
					'-Command',
					`Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${archivePath}', '${extractTo}')`,
				],
				{ stdio: 'inherit' },
			);
		} else {
			// macOS/Linux assets are .tar.gz.
			execFileSync('tar', ['-xzf', archivePath, '-C', tmp], {
				stdio: 'inherit',
			});
		}

		const serverDir = findServerDir(tmp);
		if (!serverDir) {
			throw new Error(`Could not find ${serverName} inside ${asset.name}`);
		}

		// Fresh per-variant dir so re-downloads don't leave stale files behind.
		rmSync(destDir, { recursive: true, force: true });
		mkdirSync(destDir, { recursive: true });

		// Install only the server binary + shared libraries it links against.
		// The release also ships other CLI tools (llama-cli, llama-bench, …) which
		// we don't need — skipping them keeps the bundle small.
		const isLib = (name: string) => /\.(dll|dylib|so)(\.\d+)*$/i.test(name);
		let libCount = 0;
		let totalBytes = 0;
		for (const entry of readdirSync(serverDir, { withFileTypes: true })) {
			if (!entry.isFile()) continue;
			if (entry.name !== serverName && !isLib(entry.name)) continue;
			const dest = join(destDir, entry.name);
			cpSync(join(serverDir, entry.name), dest);
			totalBytes += statSync(dest).size;
			if (entry.name === serverName) {
				if (!isWindows) execFileSync('chmod', ['+x', dest]);
			} else {
				libCount++;
			}
		}

		if (!existsSync(join(destDir, serverName))) {
			throw new Error(`Install incomplete: ${variant}/${serverName} was not copied.`);
		}
		log(
			`installed ${variant}/${serverName} + ${libCount} libs (${(totalBytes / 1_048_576).toFixed(1)} MB) into src-tauri/binaries/${variant}`,
		);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

/** Remove a stale flat install (top-level binaries/*.dll, *.exe) from before the
 *  per-variant layout. Keeps tracked docs and the variant subdirectories. */
function cleanLegacyFlatInstall() {
	if (!existsSync(BINARIES_DIR)) return;
	const KEEP = new Set(['.gitignore', 'README.md']);
	for (const entry of readdirSync(BINARIES_DIR, { withFileTypes: true })) {
		if (entry.isFile() && !KEEP.has(entry.name)) {
			rmSync(join(BINARIES_DIR, entry.name), { force: true });
		}
	}
}

async function main() {
	log(
		`platform=${process.platform} arch=${process.arch} variants=${VARIANTS.join(',')} release=${RELEASE}`,
	);

	mkdirSync(BINARIES_DIR, { recursive: true });
	cleanLegacyFlatInstall();

	const release =
		RELEASE === 'latest'
			? await gh('/releases/latest')
			: await gh(`/releases/tags/${RELEASE}`);
	const tag: string = release.tag_name;

	for (const variant of VARIANTS) {
		await installVariant(release, tag, variant);
	}
}

// Only run when invoked directly as a script (not when imported — the x86 guard
// test and baseline-capture tooling pull in the pure helpers above and must not
// trigger a network fetch / process.exit on import).
if (import.meta.main) {
	main().catch((err) => {
		console.error(`[fetch-llama-server] ${err.message ?? err}`);
		process.exit(1);
	});
}
