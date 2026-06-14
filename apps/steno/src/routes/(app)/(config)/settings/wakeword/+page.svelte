<script lang="ts">
	import * as Field from '@steno/ui/field';
	import * as Alert from '@steno/ui/alert';
	import { Switch } from '@steno/ui/switch';
	import { Button } from '@steno/ui/button';
	import { Input } from '@steno/ui/input';
	import InfoIcon from '@lucide/svelte/icons/info';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import { open } from '@tauri-apps/plugin-dialog';
	import { settings } from '$lib/state/settings.svelte';
	import { desktopServices } from '$lib/services';
	import { onDestroy, onMount } from 'svelte';

	let status = $state<'running' | 'stopped' | 'error'>('stopped');
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	async function refreshStatus() {
		if (!desktopServices?.wakeword) return;
		const { data } = await desktopServices.wakeword.getStatus();
		if (data) status = data;
	}

	async function toggleWakeWord() {
		if (!desktopServices?.wakeword) return;
		if (status === 'running') {
			await desktopServices.wakeword.stopWakeWord();
		} else {
			const scriptPath = settings.value['wakeword.scriptPath'];
			const threshold = parseFloat(settings.value['wakeword.threshold']) || 0.5;
			await desktopServices.wakeword.startWakeWord(scriptPath, threshold);
		}
		await refreshStatus();
	}

	async function browseScript() {
		const selected = await open({
			multiple: false,
			filters: [
				{
					name: 'Python Script',
					extensions: ['py', 'exe'],
				},
			],
		});
		if (selected) {
			settings.updateKey('wakeword.scriptPath', selected);
		}
	}

	// Threshold slider value derived from settings
	const thresholdValue = $derived(
		parseFloat(settings.value['wakeword.threshold']) || 0.5,
	);

	function onThresholdChange(e: Event) {
		const v = parseFloat((e.target as HTMLInputElement).value);
		settings.updateKey('wakeword.threshold', v.toFixed(2));
		if (status === 'running' && desktopServices?.wakeword) {
			desktopServices.wakeword.setThreshold(v);
		}
	}

	onMount(() => {
		refreshStatus();
		pollInterval = setInterval(refreshStatus, 3000);
	});

	onDestroy(() => {
		if (pollInterval) clearInterval(pollInterval);
	});
</script>

<svelte:head>
	<title>Wake Word Settings - Steno</title>
</svelte:head>

<Field.Set>
	<Field.Legend>Wake Word</Field.Legend>
	<Field.Description>
		Configure wake word detection to start recording hands-free using
		OpenWakeWord.
	</Field.Description>
	<Field.Separator />
	<Field.Group>
		<Field.Field orientation="horizontal">
			<Switch
				id="wakeword-enabled"
				bind:checked={
					() => settings.value['wakeword.enabled'],
					(v) => settings.updateKey('wakeword.enabled', v)
				}
			/>
			<Field.Label for="wakeword-enabled">
				Enable Wake Word Detection
			</Field.Label>
		</Field.Field>

		{#if settings.value['wakeword.enabled']}
			<Field.Field>
				<Field.Label for="wakeword-script-path">
					Script Path
				</Field.Label>
				<div class="flex gap-2">
					<Input
						id="wakeword-script-path"
						value={settings.value['wakeword.scriptPath']}
						oninput={(e) =>
							settings.updateKey(
								'wakeword.scriptPath',
								e.currentTarget.value,
							)}
						placeholder="Path to wakeword main.py or bundled exe"
						class="flex-1"
					/>
					<Button
						variant="outline"
						size="icon"
						onclick={browseScript}
						tooltip="Browse for script"
					>
						<FolderOpen class="size-4" />
					</Button>
				</div>
				<Field.Description>
					Path to the OpenWakeWord Python script (main.py) or a
					bundled executable.
				</Field.Description>
			</Field.Field>

			<Field.Field>
				<Field.Label for="wakeword-threshold">
					Detection Threshold: {thresholdValue.toFixed(2)}
				</Field.Label>
				<input
					id="wakeword-threshold"
					type="range"
					value={thresholdValue}
					min="0"
					max="1"
					step="0.05"
					oninput={onThresholdChange}
					class="w-full accent-primary"
				/>
				<Field.Description>
					Higher values require more confidence before triggering.
					Lower values are more sensitive but may cause false
					positives.
				</Field.Description>
			</Field.Field>

			<Field.Field>
				<Field.Label>Status</Field.Label>
				<div class="flex items-center gap-3">
					<div class="flex items-center gap-2">
						<span
							class="inline-block size-2.5 rounded-full {status === 'running'
								? 'bg-success'
								: status === 'error'
									? 'bg-destructive'
									: 'bg-muted-foreground'}"
						></span>
						<span class="text-sm capitalize">{status}</span>
					</div>
					<Button
						variant={status === 'running' ? 'destructive' : 'default'}
						size="sm"
						onclick={toggleWakeWord}
						disabled={!settings.value['wakeword.scriptPath']}
					>
						{status === 'running' ? 'Stop' : 'Start'}
					</Button>
				</div>
			</Field.Field>

			{#if !settings.value['wakeword.scriptPath']}
				<Alert.Root class="border-warning/20 bg-warning/5">
					<InfoIcon class="size-4 text-warning dark:text-warning" />
					<Alert.Title class="text-warning dark:text-warning">
						Script Path Required
					</Alert.Title>
					<Alert.Description>
						Please set the path to the OpenWakeWord script to enable
						wake word detection. You can find main.py in the
						sidecar/wakeword directory.
					</Alert.Description>
				</Alert.Root>
			{/if}
		{/if}
	</Field.Group>
</Field.Set>
