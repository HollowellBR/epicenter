<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { listen, type UnlistenFn } from '@tauri-apps/api/event';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { rpc } from '$lib/query';
	import { services } from '$lib/services';
	import { settings } from '$lib/state/settings.svelte';
	import * as Sidebar from '@steno/ui/sidebar';
	import AppLayout from './_components/AppLayout.svelte';
	import VerticalNav from './_components/VerticalNav.svelte';

	let { children } = $props();

	let sidebarOpen = $state(false);
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
		}
	});

	onDestroy(() => {
		unlistenNavigate?.();
	});
</script>

<Sidebar.Provider bind:open={sidebarOpen}>
	{#if settings.value['ui.layoutMode'] === 'sidebar'}
		<VerticalNav />
	{/if}
	<Sidebar.Inset>
		<AppLayout>
			{@render children()}
		</AppLayout>
	</Sidebar.Inset>
</Sidebar.Provider>
