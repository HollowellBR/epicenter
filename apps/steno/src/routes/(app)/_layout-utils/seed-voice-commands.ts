import { rpc } from '$lib/query';
import { services } from '$lib/services';
import {
	commandFileToEntities,
	getBuiltinDefaults,
} from '$lib/services/isomorphic/voice-command-engine';

/**
 * Seeds builtin default voice commands on first run.
 *
 * Checks if the voice commands table is empty. If so, inserts the
 * platform-aware builtin defaults (Ctrl on Windows/Linux, Cmd on macOS).
 */
export async function seedVoiceCommandDefaults() {
	const { data: count } = await services.db.voiceCommands.getCount();
	if (count != null && count > 0) return;

	const isMacos = services.os.type() === 'macos';
	const defaults = getBuiltinDefaults(isMacos);
	const { commands } = commandFileToEntities(defaults, 'builtin');

	for (const command of commands) {
		const { error } = await rpc.voiceCommands.commands.create(command);
		if (error) {
			console.warn(
				`[voice-commands] Failed to seed builtin "${command.title}":`,
				error.message,
			);
		}
	}
}
