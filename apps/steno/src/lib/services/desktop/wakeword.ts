import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { createTaggedError, extractErrorMessage } from 'wellcrafted/error';
import { Ok, type Result, tryAsync } from 'wellcrafted/result';

const { WakeWordServiceError, WakeWordServiceErr } =
	createTaggedError('WakeWordServiceError');
type WakeWordServiceError = ReturnType<typeof WakeWordServiceError>;

export type WakeWordStatus = 'running' | 'stopped' | 'error';

export interface WakeWordDetectedPayload {
	phrase: string;
	confidence: number;
}

export const WakeWordServiceLive = {
	async startWakeWord(
		scriptPath: string,
		threshold: number,
	): Promise<Result<void, WakeWordServiceError>> {
		return tryAsync({
			try: async () => {
				await invoke('start_wakeword', {
					scriptPath,
					threshold,
				});
			},
			catch: (error) =>
				WakeWordServiceErr({
					message: `Failed to start wake word: ${extractErrorMessage(error)}`,
				}),
		});
	},

	async stopWakeWord(): Promise<Result<void, WakeWordServiceError>> {
		return tryAsync({
			try: async () => { await invoke('stop_wakeword'); },
			catch: (error) =>
				WakeWordServiceErr({
					message: `Failed to stop wake word: ${extractErrorMessage(error)}`,
				}),
		});
	},

	async setThreshold(
		threshold: number,
	): Promise<Result<void, WakeWordServiceError>> {
		return tryAsync({
			try: async () => { await invoke('set_wakeword_threshold', { threshold }); },
			catch: (error) =>
				WakeWordServiceErr({
					message: `Failed to set threshold: ${extractErrorMessage(error)}`,
				}),
		});
	},

	async getStatus(): Promise<Result<WakeWordStatus, WakeWordServiceError>> {
		return tryAsync({
			try: () => invoke<string>('get_wakeword_status') as Promise<WakeWordStatus>,
			catch: (error) =>
				WakeWordServiceErr({
					message: `Failed to get wake word status: ${extractErrorMessage(error)}`,
				}),
		});
	},

	async onDetected(
		callback: (payload: WakeWordDetectedPayload) => void,
	): Promise<Result<UnlistenFn, WakeWordServiceError>> {
		const { data: unlisten, error } = await tryAsync({
			try: () =>
				listen<WakeWordDetectedPayload>(
					'wakeword:detected',
					(event) => callback(event.payload),
				),
			catch: (error) =>
				WakeWordServiceErr({
					message: `Failed to listen for wake word events: ${extractErrorMessage(error)}`,
				}),
		});
		if (error) return { data: null, error };
		return Ok(unlisten);
	},
};

export type WakeWordService = typeof WakeWordServiceLive;
