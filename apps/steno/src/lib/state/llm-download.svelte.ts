import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { exists, mkdir, stat } from '@tauri-apps/plugin-fs';
import { extractErrorMessage } from 'wellcrafted/error';
import { Ok, tryAsync } from 'wellcrafted/result';
import { PATHS } from '$lib/constants/paths';
import type { LlmModelConfig } from '$lib/services/isomorphic/completion/local/types';
import { isModelFileSizeValid } from '$lib/services/isomorphic/transcription/local/types';
import { settings } from '$lib/state/settings.svelte';

export type LlmDownloadState =
	| { type: 'idle' }
	| { type: 'downloading'; modelId: string; progress: number }
	| { type: 'ready' }
	| { type: 'error'; message: string };

async function llmFilePath(filename: string): Promise<string> {
	const { join } = await import('@tauri-apps/api/path');
	return join(await PATHS.MODELS.LLM(), filename);
}

/**
 * Module-level store for the local LLM (GGUF) download.
 *
 * Lives outside any component so an in-flight download — and its progress —
 * survives route navigation, component remounts, and window focus changes.
 * The Tauri `download_file` command runs in the Rust backend regardless; this
 * just keeps the UI state authoritative in one place.
 */
class LlmDownloadStore {
	#state = $state<LlmDownloadState>({ type: 'idle' });

	get state(): LlmDownloadState {
		return this.#state;
	}

	/**
	 * Re-check whether the given model's file is fully present on disk.
	 * Never overrides an active download (the partial file would fail the
	 * size check); that guard is what fixed the focus/hover state resets.
	 */
	async refreshStatus(model: LlmModelConfig): Promise<void> {
		if (this.#state.type === 'downloading') return;
		const filePath = await llmFilePath(model.filename);
		if (!(await exists(filePath))) {
			this.#state = { type: 'idle' };
			return;
		}
		const { data: fileStats } = await tryAsync({
			try: () => stat(filePath),
			catch: () => Ok(null),
		});
		if (fileStats && isModelFileSizeValid(fileStats.size, model.sizeBytes)) {
			this.#state = { type: 'ready' };
			if (settings.value['llamacpp.modelPath'] !== filePath) {
				settings.updateKey('llamacpp.modelPath', filePath);
			}
		} else {
			this.#state = { type: 'idle' };
		}
	}

	/** Download (or re-download) the given model. Safe across navigation. */
	async download(model: LlmModelConfig): Promise<void> {
		if (this.#state.type === 'downloading') return;
		this.#state = { type: 'downloading', modelId: model.id, progress: 0 };

		await tryAsync({
			try: async () => {
				const dir = await PATHS.MODELS.LLM();
				if (!(await exists(dir))) await mkdir(dir, { recursive: true });
				const filePath = await llmFilePath(model.filename);

				const unlisten = await listen<{ url: string; percent: number }>(
					'download-progress',
					(event) => {
						if (!event.payload.url.endsWith(model.filename)) return;
						if (this.#state.type === 'downloading') {
							this.#state = {
								type: 'downloading',
								modelId: model.id,
								progress: Math.min(event.payload.percent, 99),
							};
						}
					},
				);

				try {
					await invoke('download_file', {
						url: model.url,
						destPath: filePath,
					});
				} finally {
					unlisten();
				}

				settings.updateKey('llamacpp.modelPath', filePath);
				this.#state = { type: 'ready' };
				return Ok(undefined);
			},
			catch: (error) => {
				this.#state = { type: 'error', message: extractErrorMessage(error) };
				return Ok(undefined);
			},
		});
	}
}

export const llmDownload = new LlmDownloadStore();
