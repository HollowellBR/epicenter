import { invoke } from '@tauri-apps/api/core';
import * as os from '@tauri-apps/plugin-os';
import { Err, Ok, tryAsync } from 'wellcrafted/result';
import type { OsService } from '.';
import { OsServiceErr } from './types';

export function createOsServiceDesktop(): OsService {
	return {
		type: () => {
			return os.type();
		},
		getForegroundWindow: async () => {
			return tryAsync({
				try: async () => {
					const result = await invoke<{
						window_title: string;
						process_name: string;
						process_id: number;
					}>('get_foreground_window');
					return {
						windowTitle: result.window_title,
						processName: result.process_name,
						processId: result.process_id,
					};
				},
				catch: (e) =>
					OsServiceErr({
						message: `Failed to get foreground window: ${e instanceof Error ? e.message : String(e)}`,
					}),
			});
		},
	};
}
