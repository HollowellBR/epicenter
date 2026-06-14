import { createTaggedError } from 'wellcrafted/error';
import type { Result } from 'wellcrafted/result';
import { Err, Ok, tryAsync } from 'wellcrafted/result';
import type { VoiceCommand } from '$lib/services/isomorphic/db/models/voice-commands';
import type { TextService } from '$lib/services/isomorphic/text/types';

export const { VoiceCommandExecutorError, VoiceCommandExecutorErr } =
	createTaggedError('VoiceCommandExecutorError');
export type VoiceCommandExecutorError = ReturnType<
	typeof VoiceCommandExecutorError
>;

export type ActionExecutor = {
	execute(
		command: VoiceCommand,
	): Promise<Result<void, VoiceCommandExecutorError>>;
};

/**
 * Creates an action executor that dispatches based on command action type.
 *
 * - keystroke: Simulates key combo via TextService
 * - app_action: Calls registered app action by name
 * - shell: Looks up allowlist entry and executes (Phase 2)
 */
export function createActionExecutor({
	textService,
	appActionHandler,
	shellHandler,
}: {
	textService: TextService;
	appActionHandler?: (
		actionName: string,
	) => Promise<Result<void, VoiceCommandExecutorError>>;
	shellHandler?: (
		commandId: string,
	) => Promise<Result<void, VoiceCommandExecutorError>>;
}): ActionExecutor {
	return {
		async execute(
			command: VoiceCommand,
		): Promise<Result<void, VoiceCommandExecutorError>> {
			switch (command.action.type) {
				case 'keystroke': {
					if (!command.action.keystroke) {
						return Err(
							VoiceCommandExecutorError({
								message: `Command "${command.title}" has keystroke action but no keystroke config`,
							}),
						);
					}
					const { keys, delayMs } = command.action.keystroke;
					const { error } = await textService.simulateKeystroke(
						keys,
						delayMs ?? 50,
					);
					if (error) {
						return Err(
							VoiceCommandExecutorError({
								message: `Failed to simulate keystroke "${keys}": ${error.message}`,
							}),
						);
					}
					return Ok(undefined);
				}

				case 'app_action': {
					if (!command.action.appAction) {
						return Err(
							VoiceCommandExecutorError({
								message: `Command "${command.title}" has app_action type but no appAction config`,
							}),
						);
					}
					if (!appActionHandler) {
						return Err(
							VoiceCommandExecutorError({
								message: 'App action handler not registered',
							}),
						);
					}
					return appActionHandler(command.action.appAction.name);
				}

				case 'shell': {
					if (!command.action.shell) {
						return Err(
							VoiceCommandExecutorError({
								message: `Command "${command.title}" has shell type but no shell config`,
							}),
						);
					}
					if (!shellHandler) {
						return Err(
							VoiceCommandExecutorError({
								message: 'Shell handler not registered',
							}),
						);
					}
					return shellHandler(command.action.shell.commandId);
				}

				default:
					return Err(
						VoiceCommandExecutorError({
							message: `Unknown action type: ${command.action.type}`,
						}),
					);
			}
		},
	};
}
