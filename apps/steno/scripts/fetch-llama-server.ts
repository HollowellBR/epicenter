/**
 * Fetches the prebuilt llama.cpp `llama-server` binary for the current platform
 * and installs it (plus its shared libraries) into `src-tauri/binaries/`, where
 * `tauri.conf.json` bundles it as a resource and `src/llama_server.rs` resolves
 * it at runtime.
 *
 * Runs automatically before `tauri build` (see `beforeBuildCommand`), and can be
 * run manually: `bun run fetch-llama-server` (add `--force` to re-download).
 *
 * Env overrides:
 *   LLAMA_CPP_RELEASE  release tag to fetch (default: "latest"), e.g. "b9585"
 *   LLAMA_CPP_VARIANT  build variant (default: "cpu"), e.g. "cuda-12.4", "vulkan"
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
const RELEASE = process.env.LLAMA_CPP_RELEASE ?? 'latest';
const VARIANT = process.env.LLAMA_CPP_VARIANT ?? 'cpu';
const FORCE = process.argv.includes('--force');

const BINARIES_DIR = resolve(import.meta.dir, '../src-tauri/binaries');
const isWindows = process.platform === 'win32';
const serverName = isWindows ? 'llama-server.exe' : 'llama-server';

function log(msg: string) {
	console.log(`[fetch-llama-server] ${msg}`);
}

/** Build a regex that matches the release asset for this platform/arch/variant. */
function assetPattern(): RegExp {
	const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
	switch (process.platform) {
		case 'win32':
			// e.g. llama-b9585-bin-win-cpu-x64.zip
			return new RegExp(`bin-win-${VARIANT}-${arch}\\.zip$`);
		case 'darwin':
			// e.g. llama-b9585-bin-macos-arm64.tar.gz (Metal included; no variant)
			return new RegExp(`bin-macos-${arch}\\.tar\\.gz$`);
		case 'linux': {
			// CPU build has no variant segment: llama-...-bin-ubuntu-x64.tar.gz
			const seg = VARIANT && VARIANT !== 'cpu' ? `${VARIANT}-` : '';
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

async function main() {
	if (existsSync(join(BINARIES_DIR, serverName)) && !FORCE) {
		log(`${serverName} already present in src-tauri/binaries — skipping (use --force to re-download).`);
		return;
	}

	log(`platform=${process.platform} arch=${process.arch} variant=${VARIANT} release=${RELEASE}`);

	const release =
		RELEASE === 'latest'
			? await gh('/releases/latest')
			: await gh(`/releases/tags/${RELEASE}`);
	const tag: string = release.tag_name;
	const pattern = assetPattern();
	const asset = (release.assets as { name: string; browser_download_url: string }[]).find(
		(a) => pattern.test(a.name),
	);

	if (!asset) {
		const names = (release.assets as { name: string }[]).map((a) => a.name).join('\n  ');
		throw new Error(
			`No asset matching ${pattern} in release ${tag}. Available assets:\n  ${names}\n` +
				`Try setting LLAMA_CPP_VARIANT (e.g. "vulkan", "cuda-12.4").`,
		);
	}

	log(`downloading ${asset.name} (release ${tag})`);
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

		mkdirSync(BINARIES_DIR, { recursive: true });

		// Clean previously-installed binaries/libs (keep tracked docs) so
		// re-downloads don't leave stale files behind.
		const KEEP = new Set(['.gitignore', 'README.md']);
		for (const entry of readdirSync(BINARIES_DIR, { withFileTypes: true })) {
			if (entry.isFile() && !KEEP.has(entry.name)) {
				rmSync(join(BINARIES_DIR, entry.name), { force: true });
			}
		}

		// Install only the server binary + shared libraries it links against.
		// The release also ships other CLI tools (llama-cli, llama-bench, …) which
		// we don't need — skipping them keeps the bundle small.
		const isLib = (name: string) => /\.(dll|dylib|so)(\.\d+)*$/i.test(name);
		let libCount = 0;
		let totalBytes = 0;
		for (const entry of readdirSync(serverDir, { withFileTypes: true })) {
			if (!entry.isFile()) continue;
			if (entry.name !== serverName && !isLib(entry.name)) continue;
			const dest = join(BINARIES_DIR, entry.name);
			cpSync(join(serverDir, entry.name), dest);
			totalBytes += statSync(dest).size;
			if (entry.name === serverName) {
				if (!isWindows) execFileSync('chmod', ['+x', dest]);
			} else {
				libCount++;
			}
		}

		if (!existsSync(join(BINARIES_DIR, serverName))) {
			throw new Error(`Install incomplete: ${serverName} was not copied.`);
		}
		log(
			`installed ${serverName} + ${libCount} libs (${(totalBytes / 1_048_576).toFixed(1)} MB) into src-tauri/binaries`,
		);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

main().catch((err) => {
	console.error(`[fetch-llama-server] ${err.message ?? err}`);
	process.exit(1);
});
