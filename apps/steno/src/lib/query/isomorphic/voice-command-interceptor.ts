import type { StenoSoundNames } from '$lib/constants/sounds';
import { Err, Ok } from 'wellcrafted/result';
import { queryClient } from '$lib/query/client';
import { services } from '$lib/services';
import type { ShellAllowlistEntry } from '$lib/services/isomorphic/db/models/shell-allowlist';
import type { VoiceCommand } from '$lib/services/isomorphic/db/models/voice-commands';
import type { ForegroundWindowInfo } from '$lib/services/isomorphic/os';
import {
	createActionExecutor,
	detectPrefix,
	executeAppAction,
	isCommandActiveInContext,
	matchCommand,
	VoiceCommandExecutorError,
} from '$lib/services/isomorphic/voice-command-engine';
import { settings } from '$lib/state/settings.svelte';
import { voiceCommandKeys } from './voice-commands';

/**
 * Attempts to intercept a transcribed text as a voice command.
 *
 * Called in the recording pipeline after transcription, before delivery.
 * If the text matches a registered command, executes it and returns `intercepted: true`.
 * If not, returns `intercepted: false` so normal delivery proceeds.
 */
export async function tryIntercept({
	transcribedText,
	toastId,
	notify,
	sound,
}: {
	transcribedText: string;
	toastId: string;
	notify: {
		success: (opts: {
			id?: string;
			title: string;
			description: string;
		}) => void;
		warning: (opts: {
			id?: string;
			title: string;
			description: string;
		}) => void;
	};
	sound: {
		playSoundIfEnabled: (name: StenoSoundNames) => void;
	};
}): Promise<{ intercepted: boolean }> {
	const prefixKeyword = settings.value['voiceCommands.prefixKeyword'];
	const fuzzyEnabled = settings.value['voiceCommands.prefixFuzzyEnabled'];
	const fuzzyThreshold = Number.parseFloat(
		settings.value['voiceCommands.fuzzyThreshold'],
	);

	// Step 1: Detect prefix
	const prefixResult = detectPrefix(
		transcribedText,
		prefixKeyword,
		fuzzyEnabled,
		fuzzyThreshold,
	);

	if (!prefixResult.detected) {
		return { intercepted: false };
	}

	// Step 2: Get registered commands from query cache (or fetch)
	let commands =
		queryClient.getQueryData<VoiceCommand[]>(
			voiceCommandKeys.voiceCommands.all,
		) ?? [];

	// If cache is empty, try fetching
	if (commands.length === 0) {
		const { data } = await services.db.voiceCommands.getAll();
		if (data) {
			commands = data;
			queryClient.setQueryData(voiceCommandKeys.voiceCommands.all, data);
		}
	}

	// Filter to enabled commands only
	const enabledCommands = commands.filter((c) => c.enabled);

	if (enabledCommands.length === 0) {
		return { intercepted: false };
	}

	// Step 2b: Context filtering — get foreground window and filter commands
	let windowInfo: ForegroundWindowInfo | null = null;
	const hasContextCommands = enabledCommands.some((c) => c.context.enabled);
	if (hasContextCommands) {
		const { data } = await services.os.getForegroundWindow();
		windowInfo = data ?? null;
	}
	const contextFilteredCommands = enabledCommands.filter((c) =>
		isCommandActiveInContext(c, windowInfo),
	);

	if (contextFilteredCommands.length === 0) {
		return { intercepted: false };
	}

	// Step 3: Match command text against registered phrases
	const match = matchCommand(
		prefixResult.commandText,
		contextFilteredCommands,
		fuzzyThreshold,
	);

	if (!match) {
		return { intercepted: false };
	}

	// Step 4: Execute the matched command
	const executor = createActionExecutor({
		textService: services.text,
		appActionHandler: executeAppAction,
		shellHandler: async (commandId) => {
			// Look up command in allowlist
			let entries =
				queryClient.getQueryData<ShellAllowlistEntry[]>(
					voiceCommandKeys.shellAllowlist.all,
				) ?? [];
			if (entries.length === 0) {
				const { data } = await services.db.shellAllowlist.getAll();
				if (data) entries = data;
			}
			const entry = entries.find((e) => e.id === commandId);
			if (!entry) {
				return Err(
					VoiceCommandExecutorError({
						message: `Shell allowlist entry "${commandId}" not found`,
					}),
				);
			}
			// Build and execute command (desktop only)
			try {
				const { CommandServiceLive, asShellCommand } = await import(
					'$lib/services/desktop/command'
				);
				const cmd = [entry.command, ...entry.args].join(' ');
				const { error } = await CommandServiceLive.execute(
					asShellCommand(cmd),
				);
				if (error) {
					return Err(
						VoiceCommandExecutorError({
							message: `Shell command failed: ${error.message}`,
						}),
					);
				}
				return Ok(undefined);
			} catch (e) {
				return Err(
					VoiceCommandExecutorError({
						message: `Shell execution failed: ${e instanceof Error ? e.message : String(e)}`,
					}),
				);
			}
		},
	});

	const { error } = await executor.execute(match.command);

	if (error) {
		if (settings.value['voiceCommands.showNotification']) {
			notify.warning({
				id: toastId,
				title: `Voice command failed: ${match.command.title}`,
				description: error.message,
			});
		}
		return { intercepted: true };
	}

	// Step 5: Feedback
	if (settings.value['voiceCommands.feedbackSound']) {
		sound.playSoundIfEnabled('voiceCommandExecuted');
	}

	if (settings.value['voiceCommands.showNotification']) {
		notify.success({
			id: toastId,
			title: `Voice command: ${match.command.title}`,
			description: `Executed "${match.phrase}" (${Math.round(match.similarity * 100)}% match)`,
		});
	}

	return { intercepted: true };
}
