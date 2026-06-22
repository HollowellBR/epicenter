<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { listen, type UnlistenFn } from '@tauri-apps/api/event';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { invoke } from '@tauri-apps/api/core';
	import { rpc } from '$lib/query';
	import { services } from '$lib/services';
	import { settings } from '$lib/state/settings.svelte';
	import * as Sidebar from '@steno/ui/sidebar';
	import AppLayout from './_components/AppLayout.svelte';
	import VerticalNav from './_components/VerticalNav.svelte';

	let { children } = $props();

	// Default-open so the full labeled sidebar is visible on launch. Combined
	// with the low Provider breakpoint below, the nav no longer hides into an
	// off-canvas mobile sheet at the app's narrow default window width.
	let sidebarOpen = $state(true);
	let unlistenNavigate: UnlistenFn | null = null;

	$effect(() => {
		const unlisten = services.localShortcutManager.listen();
		return () => unlisten();
	});

	// Log app started event once on mount
	$effect(() => {
		rpc.analytics.logEvent({ type: 'app_started' });
	});

	// Listen for navigation events from other windows
	onMount(async () => {
		unlistenNavigate = await listen<{ path: string }>(
			'navigate-main-window',
			(event) => {
				goto(event.payload.path);
			},
		);

		// Intercept window close to minimize to tray instead of quitting
		if (window.__TAURI_INTERNALS__) {
			const appWindow = getCurrentWindow();
			await appWindow.onCloseRequested(async (event) => {
				event.preventDefault();
				await appWindow.hide();
			});

			// Warm-load the local transcription model in the background so the
			// first recording after launch doesn't pay the one-time cold model
			// load (~10s for the 2.5 GB FP32 model) before any audio is processed.
			// Fire-and-forget: the Rust command is idempotent and the model stays
			// resident for the session, so a failure here just falls back to the
			// existing lazy load on first transcription.
			if (
				settings.value['transcription.selectedTranscriptionService'] ===
				'parakeet'
			) {
				const modelPath = settings.value['transcription.parakeet.modelPath'];
				if (modelPath) {
					invoke('preload_parakeet_model', { modelPath }).catch(() => {});
				}
			}
		}
	});

	onDestroy(() => {
		unlistenNavigate?.();
	});
</script>

<!--
	breakpoint=640 to match the sidebar's `sm:` desktop CSS gate (lowered from the
	stock `md`/768 so the persistent sidebar shows at the app's ~720px window
	instead of disappearing into an off-canvas sheet). The JS `isMobile` threshold
	and the CSS breakpoint must agree: below 640 → mobile sheet, at/above 640 →
	persistent desktop sidebar. The 72px mini mode falls below it (mic only).
-->
<Sidebar.Provider bind:open={sidebarOpen} breakpoint={640}>
	{#if settings.value['ui.layoutMode'] === 'sidebar'}
		<VerticalNav />
	{/if}
	<Sidebar.Inset>
		<AppLayout>
			{@render children()}
		</AppLayout>
	</Sidebar.Inset>
</Sidebar.Provider>
