import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Brand } from 'wellcrafted/brand';
import { createTaggedError, extractErrorMessage } from 'wellcrafted/error';
import { Err, Ok, type Result, tryAsync } from 'wellcrafted/result';
import type { ShortcutEventState } from '$lib/commands';

const { GlobalShortcutServiceError, GlobalShortcutServiceErr } =
	createTaggedError('GlobalShortcutServiceError');
type GlobalShortcutServiceError = ReturnType<typeof GlobalShortcutServiceError>;

/**
 * A type that represents a hotkey combination string.
 * Format: modifier keys joined with '+', all lowercase.
 * Example: "ctrl+shift+space"
 */
export type Accelerator = string & Brand<'Accelerator'>;

// Track active event listeners for cleanup
const activeListeners: Map<string, Array<() => void>> = new Map();

export const GlobalShortcutManagerLive = {
	async register({
		accelerator,
		callback,
		on,
	}: {
		accelerator: Accelerator;
		callback: (state: ShortcutEventState) => void;
		on: ShortcutEventState[];
	}): Promise<Result<void, GlobalShortcutServiceError>> {
		// Unregister first if already registered
		const { error: unregisterError } =
			await GlobalShortcutManagerLive.unregister(accelerator);
		if (unregisterError) return Err(unregisterError);

		// Determine mode based on what events we listen for
		const hasBothPressAndRelease =
			on.includes('Pressed') && on.includes('Released');
		const mode = hasBothPressAndRelease ? 'push-to-talk' : 'toggle';

		// Register with Rust backend
		const { error: registerError } = await tryAsync({
			try: () => invoke('register_hotkey', { combo: accelerator, mode }),
			catch: (error) =>
				GlobalShortcutServiceErr({
					message: `Failed to register hotkey '${accelerator}': ${extractErrorMessage(error)}`,
				}),
		});
		if (registerError) return Err(registerError);

		// Set up event listeners
		const cleanups: Array<() => void> = [];

		if (mode === 'toggle') {
			const unlisten = await listen<string>('hotkey:toggle', (event) => {
				if (event.payload === accelerator && on.includes('Pressed')) {
					callback('Pressed');
				}
			});
			cleanups.push(unlisten);
		} else {
			if (on.includes('Pressed')) {
				const unlisten = await listen<string>(
					'hotkey:ptt-start',
					(event) => {
						if (event.payload === accelerator) {
							callback('Pressed');
						}
					},
				);
				cleanups.push(unlisten);
			}
			if (on.includes('Released')) {
				const unlisten = await listen<string>(
					'hotkey:ptt-stop',
					(event) => {
						if (event.payload === accelerator) {
							callback('Released');
						}
					},
				);
				cleanups.push(unlisten);
			}
		}

		activeListeners.set(accelerator, cleanups);
		return Ok(undefined);
	},

	async unregister(
		accelerator: Accelerator,
	): Promise<Result<void, GlobalShortcutServiceError>> {
		// Clean up event listeners
		const cleanups = activeListeners.get(accelerator);
		if (cleanups) {
			for (const cleanup of cleanups) cleanup();
			activeListeners.delete(accelerator);
		}

		// Unregister from Rust backend
		const { error: unregisterError } = await tryAsync({
			try: () => invoke('unregister_hotkey', { combo: accelerator }),
			catch: (error) =>
				GlobalShortcutServiceErr({
					message: `Failed to unregister hotkey '${accelerator}': ${extractErrorMessage(error)}`,
				}),
		});
		if (unregisterError) return Err(unregisterError);
		return Ok(undefined);
	},

	async unregisterAll(): Promise<Result<void, GlobalShortcutServiceError>> {
		// Clean up all event listeners
		for (const [, cleanups] of activeListeners) {
			for (const cleanup of cleanups) cleanup();
		}
		activeListeners.clear();

		// Get all registered hotkeys and unregister them
		const { error: listError } = await tryAsync({
			try: async () => {
				const hotkeys = await invoke<Array<{ combo: string }>>(
					'list_hotkeys',
				);
				await Promise.all(
					hotkeys.map((hk) =>
						invoke('unregister_hotkey', { combo: hk.combo }),
					),
				);
			},
			catch: (error) =>
				GlobalShortcutServiceErr({
					message: `Failed to unregister all hotkeys: ${extractErrorMessage(error)}`,
				}),
		});
		if (listError) return Err(listError);
		return Ok(undefined);
	},
};

export type GlobalShortcutManager = typeof GlobalShortcutManagerLive;

/**
 * Validates if a string could be a valid hotkey accelerator.
 * Accepts format like "ctrl+shift+space" (lowercase, '+' separated).
 */
export function isValidElectronAccelerator(accelerator: string): boolean {
	const parts = accelerator.split('+');
	return parts.length > 0 && parts.every((p) => p.trim().length > 0);
}

/**
 * Convert pressed keys to a hotkey combo string.
 * Returns a '+' joined lowercase string.
 */
export function pressedKeysToTauriAccelerator(
	pressedKeys: string[],
): Result<Accelerator, { _tag: string; message: string }> {
	if (pressedKeys.length === 0) {
		return Err({
			_tag: 'InvalidAcceleratorError',
			message: 'No keys pressed',
		});
	}

	const accelerator = pressedKeys.join('+').toLowerCase() as Accelerator;
	return Ok(accelerator);
}
