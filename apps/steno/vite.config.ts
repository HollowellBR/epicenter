import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { createLogger, defineConfig } from 'vite';
import devtoolsJson from 'vite-plugin-devtools-json';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const host = process.env.TAURI_DEV_HOST;

/**
 * Custom logger that suppresses cyclic cross-chunk re-export warnings.
 *
 * The query and services layers have tightly coupled barrel files. Rollup
 * splits them into separate chunks and warns about execution order, but all
 * cross-layer calls are behind user actions or dynamic imports — never at
 * module initialization time — so these warnings are benign.
 */
const logger = createLogger();
const originalWarn = logger.warn.bind(logger);
logger.warn = (msg, options) => {
	// Cyclic cross-chunk re-export: query/services barrel files are tightly
	// coupled but all cross-layer calls are lazy, not at module init time.
	if (msg.includes('was reexported through')) return;
	// External module unused default: svelte internals + vite-plugin-node-polyfills
	if (msg.includes('"default" is imported from external module')) return;
	// Chunk size: the app bundles substantial UI + query logic; gzipped size
	// is reasonable (~340kB) and code-splitting further would hurt load perf.
	if (msg.includes('Some chunks are larger than')) return;
	originalWarn(msg, options);
};

// https://vitejs.dev/config/
export default defineConfig(async () => ({
	customLogger: logger,
	plugins: [
		sveltekit(),
		tailwindcss(),
		devtoolsJson(),
		nodePolyfills({
			// Enable polyfills for Buffer (needed by gray-matter)
			globals: {
				Buffer: true,
			},
		}),
	],
	resolve: {
		dedupe: ['yjs'],
	},
	// Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
	//
	// 1. prevent vite from obscuring rust errors
	clearScreen: false,
	// 2. tauri expects a fixed port, fail if that port is not available
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host
			? {
					protocol: 'ws',
					host,
					port: 1421,
				}
			: undefined,
		watch: {
			// 3. tell vite to ignore watching `src-tauri`
			ignored: ['**/src-tauri/**'],
		},
	},
}));
