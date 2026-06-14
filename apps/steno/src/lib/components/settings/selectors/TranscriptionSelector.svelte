<script lang="ts">
	import { goto } from '$app/navigation';
	import { sep } from '@tauri-apps/api/path';
	import { Button } from '@steno/ui/button';
	import * as Command from '@steno/ui/command';
	import * as Popover from '@steno/ui/popover';
	import { useCombobox } from '@steno/ui/hooks';
	import {
		TRANSCRIPTION_SERVICES,
		type TranscriptionService,
	} from '$lib/services/isomorphic/transcription/registry';
	import {
		getSelectedTranscriptionService,
		isTranscriptionServiceConfigured,
	} from '$lib/settings/transcription-validation';
	import { settings } from '$lib/state/settings.svelte';
	import { cn } from '@steno/ui/utils';
	import CheckIcon from '@lucide/svelte/icons/check';
	import MicIcon from '@lucide/svelte/icons/mic';
	import SettingsIcon from '@lucide/svelte/icons/settings';

	let { class: className }: { class?: string } = $props();

	const selectedService = $derived(getSelectedTranscriptionService());

	const combobox = useCombobox();
</script>

{#snippet renderServiceIcon(service: TranscriptionService)}
	<div
		class={cn(
			'size-4 shrink-0 flex items-center justify-center [&>svg]:size-full',
			service.invertInDarkMode &&
				'dark:[&>svg]:invert dark:[&>svg]:brightness-90',
		)}
	>
		{@html service.icon}
	</div>
{/snippet}

<Popover.Root bind:open={combobox.open}>
	<Popover.Trigger bind:ref={combobox.triggerRef}>
		{#snippet child({ props })}
			<Button
				{...props}
				class={cn('relative', className)}
				tooltip={selectedService
					? selectedService.name
					: 'Select transcription service'}
				role="combobox"
				aria-expanded={combobox.open}
				variant="ghost"
				size="icon"
			>
				{#if selectedService}
					<div
						class={cn(
							'size-4 flex items-center justify-center [&>svg]:size-full',
							selectedService.invertInDarkMode &&
								'dark:[&>svg]:invert dark:[&>svg]:brightness-90',
							!isTranscriptionServiceConfigured(selectedService) &&
								'opacity-60',
						)}
					>
						{@html selectedService.icon}
					</div>
				{:else}
					<MicIcon class="size-4 text-muted-foreground" />
				{/if}
				{#if selectedService && !isTranscriptionServiceConfigured(selectedService)}
					<span
						class="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-warning before:absolute before:left-0 before:top-0 before:h-full before:w-full before:rounded-full before:bg-warning/50 before:animate-ping"
					></span>
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="p-0">
		<Command.Root loop>
			<Command.Input placeholder="Search services..." class="h-9 text-sm" />
			<Command.List class="max-h-[40vh]">
				<Command.Empty>No service found.</Command.Empty>

				<!-- Local Services -->
				<Command.Group heading="Local">
					{#each TRANSCRIPTION_SERVICES as service (service.id)}
						{@const isSelected =
							settings.value['transcription.selectedTranscriptionService'] ===
							service.id}
						{@const isConfigured = isTranscriptionServiceConfigured(service)}
						{@const modelPath = settings.value[service.modelPathField]}

						<Command.Item
							value={`${service.id} ${service.name} local offline`}
							onSelect={() => {
								settings.updateKey(
									'transcription.selectedTranscriptionService',
									service.id,
								);
								combobox.closeAndFocusTrigger();
							}}
							class="flex items-center gap-2 px-2 py-2"
						>
							<CheckIcon
								class={cn('size-3.5 shrink-0', {
									'text-transparent': !isSelected,
								})}
							/>
							{@render renderServiceIcon(service)}
							<div class="flex-1 min-w-0">
								<div class="font-medium text-sm">{service.name}</div>
								{#if modelPath}
									<div class="text-xs text-muted-foreground truncate">
										{modelPath.split(sep()).pop() || modelPath}
									</div>
								{:else if !isConfigured}
									<span class="text-xs text-warning">
										Model file required
									</span>
								{/if}
							</div>
						</Command.Item>
					{/each}
				</Command.Group>

				<Command.Separator />
				<Command.Item
					value="settings"
					onSelect={() => {
						goto('/settings/transcription');
						combobox.closeAndFocusTrigger();
					}}
					class="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground"
				>
					<SettingsIcon class="size-3.5" />
					Configure services
				</Command.Item>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
