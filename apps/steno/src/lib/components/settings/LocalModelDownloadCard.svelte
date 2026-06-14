<script lang="ts">
	import { PATHS } from '$lib/constants/paths';
	import {
		isModelFileSizeValid,
		type LocalModelConfig,
	} from '$lib/services/isomorphic/transcription/local/types';
	import { settings } from '$lib/state/settings.svelte';
	import CheckIcon from '@lucide/svelte/icons/check';
	import Download from '@lucide/svelte/icons/download';
	import { Spinner } from '@steno/ui/spinner';
	import X from '@lucide/svelte/icons/x';
	import { Badge } from '@steno/ui/badge';
	import { Button } from '@steno/ui/button';
	import { Progress } from '@steno/ui/progress';
	import { invoke } from '@tauri-apps/api/core';
	import { listen } from '@tauri-apps/api/event';
	import { join } from '@tauri-apps/api/path';
	import {
		exists,
		mkdir,
		remove,
		stat,
	} from '@tauri-apps/plugin-fs';
	import { toast } from 'svelte-sonner';
	import { extractErrorMessage } from 'wellcrafted/error';
	import { Ok, tryAsync } from 'wellcrafted/result';

	let {
		model,
	}: {
		model: LocalModelConfig;
	} = $props();

	type ModelState =
		| { type: 'not-downloaded' }
		| { type: 'downloading'; progress: number }
		| { type: 'ready' }
		| { type: 'active' };

	let modelState = $state<ModelState>({ type: 'not-downloaded' });

	async function ensureModelDestinationPath(): Promise<string> {
		const parakeetModelsDir = await PATHS.MODELS.PARAKEET();
		if (!(await exists(parakeetModelsDir))) {
			await mkdir(parakeetModelsDir, { recursive: true });
		}
		return await join(parakeetModelsDir, model.directoryName);
	}

	async function isModelValid(path: string): Promise<boolean> {
		if (!(await exists(path))) return false;
		const { data: dirStats } = await tryAsync({
			try: () => stat(path),
			catch: () => Ok(null),
		});
		if (!dirStats?.isDirectory) return false;

		for (const file of model.files) {
			const filePath = await join(path, file.filename);
			if (!(await exists(filePath))) return false;
			const { data: fileStats } = await tryAsync({
				try: () => stat(filePath),
				catch: () => Ok(null),
			});
			if (!fileStats) return false;
			if (!isModelFileSizeValid(fileStats.size, file.sizeBytes)) {
				console.warn(
					`Parakeet file "${file.filename}" appears corrupted: ${Math.round(fileStats.size / 1_000_000)}MB, expected ~${Math.round(file.sizeBytes / 1_000_000)}MB`,
				);
				return false;
			}
		}
		return true;
	}

	$effect(() => {
		const currentPath = settings.value['transcription.parakeet.modelPath'];
		refreshStatus();
	});

	async function refreshStatus() {
		await tryAsync({
			try: async () => {
				const path = await ensureModelDestinationPath();
				const isValid = await isModelValid(path);

				if (!isValid) {
					modelState = { type: 'not-downloaded' };
					return;
				}

				const currentPath = settings.value['transcription.parakeet.modelPath'];
				const isActive = currentPath === path;

				modelState = isActive ? { type: 'active' } : { type: 'ready' };
			},
			catch: () => {
				modelState = { type: 'not-downloaded' };
				return Ok(undefined);
			},
		});
	}

	async function downloadModel() {
		if (modelState.type === 'downloading') return;

		modelState = { type: 'downloading', progress: 0 };

		await tryAsync({
			try: async () => {
				const path = await ensureModelDestinationPath();

				await refreshStatus();
				if (modelState.type === 'ready' || modelState.type === 'active') {
					if (modelState.type === 'ready') {
						await activateModel();
					}
					toast.success('Model already downloaded and activated');
					return;
				}

				const totalBytes = model.sizeBytes;
				let completedBytes = 0;

				await mkdir(path, { recursive: true });

				// Listen for per-file progress events from Rust
				const unlisten = await listen<{
					url: string;
					downloaded: number;
					total: number;
					percent: number;
				}>('download-progress', (event) => {
					const fileProgress = event.payload.downloaded;
					const currentFile = model.files.find((f) => event.payload.url.endsWith(f.filename));
					if (!currentFile) return;

					const overallProgress = Math.round(
						((completedBytes + fileProgress) / totalBytes) * 100,
					);
					modelState = {
						type: 'downloading',
						progress: Math.min(overallProgress, 99),
					};
				});

				try {
					for (const file of model.files) {
						const filePath = await join(path, file.filename);
						await invoke('download_file', {
							url: file.url,
							destPath: filePath,
						});
						completedBytes += file.sizeBytes;
					}
				} finally {
					unlisten();
				}

				await activateModel();
				modelState = { type: 'active' };
				toast.success('Model downloaded and activated successfully');
			},
			catch: (error) => {
				console.error('Download failed:', error);
				toast.error('Failed to download model', {
					description: extractErrorMessage(error),
				});
				modelState = { type: 'not-downloaded' };
				return Ok(undefined);
			},
		});
	}

	async function activateModel() {
		const path = await ensureModelDestinationPath();
		settings.updateKey('transcription.parakeet.modelPath', path);
		toast.success('Model activated');
	}

	async function deleteModel() {
		await tryAsync({
			try: async () => {
				const path = await ensureModelDestinationPath();
				if (await exists(path)) {
					await remove(path, { recursive: true });
				}

				if (settings.value['transcription.parakeet.modelPath'] === path) {
					settings.updateKey('transcription.parakeet.modelPath', '');
				}

				modelState = { type: 'not-downloaded' };
				toast.success('Model deleted');
			},
			catch: (error) => {
				toast.error('Failed to delete model', {
					description: extractErrorMessage(error),
				});
				return Ok(undefined);
			},
		});
	}
</script>

<div
	class="flex items-center gap-3 p-3 rounded-lg border {modelState.type ===
	'active'
		? 'border-primary bg-primary/5'
		: ''}"
>
	<div class="flex-1">
		<div class="flex items-center gap-2">
			<span class="font-medium">{model.name}</span>
			{#if modelState.type === 'active'}
				<Badge variant="default" class="text-xs">Active</Badge>
			{:else if modelState.type === 'ready'}
				<Badge variant="secondary" class="text-xs">Downloaded</Badge>
			{/if}
		</div>
		<div class="text-sm text-muted-foreground">
			{model.description}
		</div>
		<div class="text-xs text-muted-foreground mt-1">
			{model.size}
		</div>
	</div>

	<div class="flex items-center gap-2">
		{#if modelState.type === 'downloading'}
			<div class="flex items-center gap-2 min-w-[120px]">
				<Spinner />
				<span class="text-sm font-medium">{modelState.progress}%</span>
			</div>
		{:else if modelState.type === 'ready'}
			<Button size="sm" variant="outline" onclick={activateModel}>
				Activate
			</Button>
			<Button size="sm" variant="ghost" onclick={deleteModel}>
				<X class="size-4" />
			</Button>
		{:else if modelState.type === 'active'}
			<Button size="sm" variant="default" disabled>
				<CheckIcon class="size-4 mr-1" />
				Activated
			</Button>
			<Button size="sm" variant="ghost" onclick={deleteModel}>
				<X class="size-4" />
			</Button>
		{:else}
			<Button size="sm" variant="outline" onclick={downloadModel}>
				<Download class="size-4" />
				Download
			</Button>
		{/if}
	</div>
</div>

{#if modelState.type === 'downloading' && modelState.progress > 0}
	<Progress value={modelState.progress} class="mt-2 h-2" />
{/if}
