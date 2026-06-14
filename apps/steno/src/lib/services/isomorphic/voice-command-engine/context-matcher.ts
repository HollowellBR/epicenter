import type { ForegroundWindowInfo } from '$lib/services/isomorphic/os';
import type { VoiceCommand } from '$lib/services/isomorphic/db/models/voice-commands';

/**
 * Tests whether a voice command is active in the current window context.
 *
 * Commands with `context.enabled: false` are always active.
 * When context filtering is enabled, the command's regex patterns are tested
 * against the foreground window's title and process name.
 */
export function isCommandActiveInContext(
	command: VoiceCommand,
	windowInfo: ForegroundWindowInfo | null,
): boolean {
	if (!command.context.enabled) return true;
	if (!windowInfo) return false;

	const { windowTitlePattern, processNamePattern } = command.context;

	// If window title pattern is set, test it
	if (windowTitlePattern) {
		try {
			const regex = new RegExp(windowTitlePattern, 'i');
			if (!regex.test(windowInfo.windowTitle)) return false;
		} catch {
			// Invalid regex — treat as no match
			return false;
		}
	}

	// If process name pattern is set, test it
	if (processNamePattern) {
		try {
			const regex = new RegExp(processNamePattern, 'i');
			if (!regex.test(windowInfo.processName)) return false;
		} catch {
			return false;
		}
	}

	return true;
}
