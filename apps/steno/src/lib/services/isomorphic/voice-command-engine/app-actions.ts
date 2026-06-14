import { Err, Ok, type Result } from 'wellcrafted/result';
import { VoiceCommandExecutorError } from './executor';

/** Registry of app actions available for voice commands. */
export const APP_ACTION_OPTIONS = [
	{ value: 'toggleManualRecording', label: 'Toggle Manual Recording' },
	{ value: 'startManualRecording', label: 'Start Manual Recording' },
	{ value: 'stopManualRecording', label: 'Stop Manual Recording' },
	{ value: 'cancelManualRecording', label: 'Cancel Manual Recording' },
	{ value: 'toggleVadRecording', label: 'Toggle VAD Recording' },
	{ value: 'startVadRecording', label: 'Start VAD Recording' },
	{ value: 'stopVadRecording', label: 'Stop VAD Recording' },
] as const;

export type AppActionName = (typeof APP_ACTION_OPTIONS)[number]['value'];

/**
 * Execute a registered app action by name.
 * Uses lazy import to avoid circular dependency with actions.ts.
 */
export async function executeAppAction(
	actionName: string,
): Promise<Result<void, ReturnType<typeof VoiceCommandExecutorError>>> {
	const validNames = new Set<string>(
		APP_ACTION_OPTIONS.map((o) => o.value),
	);
	if (!validNames.has(actionName)) {
		return Err(
			VoiceCommandExecutorError({
				message: `Unknown app action: "${actionName}"`,
			}),
		);
	}

	// Lazy import to break circular dependency (actions.ts → interceptor → this)
	const { commands } = await import('$lib/query/isomorphic/actions');

	const actionMap: Record<string, () => Promise<unknown>> = {
		toggleManualRecording: () =>
			commands.toggleManualRecording(undefined),
		startManualRecording: () => commands.startManualRecording(undefined),
		stopManualRecording: () => commands.stopManualRecording(undefined),
		cancelManualRecording: () =>
			commands.cancelManualRecording(undefined),
		toggleVadRecording: () => commands.toggleVadRecording(undefined),
		startVadRecording: () => commands.startVadRecording(undefined),
		stopVadRecording: () => commands.stopVadRecording(undefined),
	};

	const action = actionMap[actionName];
	if (!action) {
		return Err(
			VoiceCommandExecutorError({
				message: `App action "${actionName}" is registered but has no handler`,
			}),
		);
	}

	try {
		await action();
		return Ok(undefined);
	} catch (e) {
		return Err(
			VoiceCommandExecutorError({
				message: `App action "${actionName}" failed: ${e instanceof Error ? e.message : String(e)}`,
			}),
		);
	}
}
