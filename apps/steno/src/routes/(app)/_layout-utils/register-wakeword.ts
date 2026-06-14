import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { commandCallbacks } from '$lib/commands';
import { settings } from '$lib/state/settings.svelte';
import { desktopServices } from '$lib/services';

interface WakeWordDetectedPayload {
	phrase: string;
	confidence: number;
}

/**
 * Registers a listener for wake word detection events.
 * When a wake word is detected, toggles manual recording (same as the hotkey).
 *
 * Also auto-starts the wake word sidecar if enabled in settings.
 *
 * Returns a cleanup function to remove the listener.
 */
export async function registerWakeWord(): Promise<() => void> {
	const unlisten = await listen<WakeWordDetectedPayload>(
		'wakeword:detected',
		() => {
			commandCallbacks.toggleManualRecording();
		},
	);

	// Auto-start sidecar if enabled and script path is set
	if (
		settings.value['wakeword.enabled'] &&
		settings.value['wakeword.scriptPath'] &&
		desktopServices?.wakeword
	) {
		const threshold =
			parseFloat(settings.value['wakeword.threshold']) || 0.5;
		desktopServices.wakeword.startWakeWord(
			settings.value['wakeword.scriptPath'],
			threshold,
		);
	}

	return unlisten;
}
