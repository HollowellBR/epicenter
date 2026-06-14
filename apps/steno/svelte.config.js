// Tauri doesn't have a Node.js server to do proper SSR
// so we will use adapter-static to prerender the app (SSG)
// This works for both Tauri and Cloudflare Workers + Assets
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import staticAdapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: staticAdapter({
			fallback: 'index.html', // SPA fallback for dynamic routes
		}),
		alias: {
			$routes: './src/routes',
			'#': '../../packages/ui/src',
		},
	},

	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	vitePlugin: {
		inspector: {
			// Dev-only component inspector. The on-screen toggle button is hidden
			// (not part of the app UI); devs can still trigger it via the key combo.
			holdMode: true,
			showToggleButton: 'never',
			toggleKeyCombo: 'alt-x',
		},
	},
};

export default config;
