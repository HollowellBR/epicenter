<script lang="ts">
	import { onNavigate } from '$app/navigation';
	import { queryClient } from '$lib/query/client';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { ModeWatcher, mode } from 'mode-watcher';
	import { Toaster, type ToasterProps } from 'svelte-sonner';
	import '@steno/ui/app.css';
	import * as Tooltip from '@steno/ui/tooltip';

	let { children } = $props();

	const TOASTER_SETTINGS = {
		position: 'bottom-right',
		richColors: true,
		duration: 5000,
		visibleToasts: 5,
		toastOptions: {
			classes: {
				toast: 'flex flex-wrap *:data-content:flex-1',
				icon: 'shrink-0',
				actionButton: 'w-full mt-3 inline-flex justify-center',
				closeButton: 'w-full mt-3 inline-flex justify-center',
			},
		},
		closeButton: true,
	} satisfies ToasterProps;

	onNavigate((navigation) => {
		if (!document.startViewTransition) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<title>Steno</title>
</svelte:head>

<QueryClientProvider client={queryClient}>
	<Tooltip.Provider delayDuration={300} skipDelayDuration={150}>
		{@render children()}
	</Tooltip.Provider>
</QueryClientProvider>

<Toaster
	offset={16}
	class="xs:block hidden"
	theme={mode.current}
	{...TOASTER_SETTINGS}
/>
<ModeWatcher defaultMode="dark" track={false} />
