/**
 * Migrates models + settings from the DEV app data dir (`io.steno.app.dev`,
 * used by `bun run dev`) to the PRODUCTION app data dir (`io.steno.app`, used by
 * an installed `tauri build`), so a real install doesn't lose your downloaded
 * models or configuration.
 *
 * What it does:
 *   1. Copies `models/` (Parakeet + Qwen3 GGUF) dev → prod.
 *   2. Copies `settings.json`, rewriting absolute paths that point at the dev
 *      data dir, and clearing `llamacpp.serverPath` so prod resolves its own
 *      bundled llama-server.
 *
 * IMPORTANT: run this AFTER building/installing prod but BEFORE the first launch
 * of the installed app. On first launch with empty localStorage, the app reads
 * `settings.json` as its fallback (see createPersistedState). If prod has
 * already launched once, re-run won't override its localStorage — in that case
 * just re-select the models in Settings (the files are already copied).
 *
 * Usage:
 *   bun run migrate-dev-data            # perform the migration
 *   bun run migrate-dev-data --dry-run  # show what would happen, copy nothing
 *   bun run migrate-dev-data --force    # overwrite existing prod models
 */

import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEV_ID = 'io.steno.app.dev';
const PROD_ID = 'io.steno.app';
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

function log(msg: string) {
	console.log(`[migrate-dev-data] ${msg}`);
}

/** Tauri's appDataDir per platform. */
function appDataDir(identifier: string): string {
	const home = homedir();
	switch (process.platform) {
		case 'win32':
			return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), identifier);
		case 'darwin':
			return join(home, 'Library', 'Application Support', identifier);
		default:
			return join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), identifier);
	}
}

function mb(bytes: number): string {
	return `${(bytes / 1_048_576).toFixed(0)} MB`;
}

/** Recursively sum file sizes under a path. */
function dirSize(path: string): number {
	let total = 0;
	const stack = [path];
	while (stack.length) {
		const p = stack.pop()!;
		const s = statSync(p);
		if (s.isDirectory()) {
			for (const e of readdirSync(p)) stack.push(join(p, e));
		} else {
			total += s.size;
		}
	}
	return total;
}

function main() {
	const devDir = appDataDir(DEV_ID);
	const prodDir = appDataDir(PROD_ID);
	log(`dev : ${devDir}`);
	log(`prod: ${prodDir}`);
	if (DRY_RUN) log('(dry run — no files will be written)');

	if (!existsSync(devDir)) {
		log(`Nothing to migrate: dev data dir does not exist.`);
		return;
	}

	// 1. Models ---------------------------------------------------------------
	const devModels = join(devDir, 'models');
	const prodModels = join(prodDir, 'models');
	if (existsSync(devModels)) {
		const size = dirSize(devModels);
		if (existsSync(prodModels) && !FORCE) {
			log(`models/ already exists in prod — skipping (use --force to overwrite). [${mb(size)} in dev]`);
		} else {
			log(`copying models/ (${mb(size)})…`);
			if (!DRY_RUN) {
				mkdirSync(prodDir, { recursive: true });
				cpSync(devModels, prodModels, { recursive: true });
			}
			log('models copied.');
		}
	} else {
		log('no models/ in dev — skipping.');
	}

	// 2. settings.json --------------------------------------------------------
	const devSettings = join(devDir, 'settings.json');
	const prodSettings = join(prodDir, 'settings.json');
	if (existsSync(devSettings)) {
		if (existsSync(prodSettings) && !FORCE) {
			log('settings.json already exists in prod — skipping (use --force to overwrite).');
		} else {
			const raw = readFileSync(devSettings, 'utf8');
			let obj: Record<string, unknown>;
			try {
				obj = JSON.parse(raw);
			} catch (e) {
				log(`could not parse dev settings.json — skipping settings migration: ${String(e)}`);
				return;
			}
			let rewrites = 0;
			for (const [k, v] of Object.entries(obj)) {
				if (typeof v === 'string' && v.includes(DEV_ID)) {
					obj[k] = v.replaceAll(DEV_ID, PROD_ID);
					rewrites++;
				}
			}
			// Prod resolves its own bundled llama-server; clear any dev-specific path.
			if (typeof obj['llamacpp.serverPath'] === 'string' && obj['llamacpp.serverPath']) {
				obj['llamacpp.serverPath'] = '';
				log('cleared llamacpp.serverPath (prod uses its bundled binary).');
			}
			log(`migrating settings.json (${rewrites} path(s) rewritten dev → prod)…`);
			if (!DRY_RUN) {
				mkdirSync(prodDir, { recursive: true });
				writeFileSync(prodSettings, JSON.stringify(obj));
			}
			log('settings migrated.');
		}
	} else {
		log('no settings.json in dev — settings will start at defaults.');
	}

	log(DRY_RUN ? 'dry run complete.' : 'done. Launch the installed app — your models and settings should carry over.');
}

main();
