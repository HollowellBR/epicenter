import { type } from 'arktype';
import { nanoid } from 'nanoid/non-secure';

const VoiceCommandAction = type({
	type: "'keystroke' | 'app_action' | 'shell'",
	'keystroke?': type({
		keys: 'string',
		'delayMs?': 'number',
	}),
	'appAction?': type({
		name: 'string',
	}),
	'shell?': type({
		commandId: 'string',
	}),
});

const VoiceCommandContext = type({
	enabled: 'boolean',
	'windowTitlePattern?': 'string',
	'processNamePattern?': 'string',
});

export const VoiceCommand = type({
	id: 'string',
	title: 'string',
	description: 'string',
	enabled: 'boolean',
	phrases: 'string[]',
	action: VoiceCommandAction,
	context: VoiceCommandContext,
	source: "'user' | 'builtin' | 'json_file'",
	createdAt: 'string',
	updatedAt: 'string',
});

export type VoiceCommand = typeof VoiceCommand.infer;

export function generateDefaultVoiceCommand(): VoiceCommand {
	const now = new Date().toISOString();
	return {
		id: nanoid(),
		title: '',
		description: '',
		enabled: true,
		phrases: [],
		action: {
			type: 'keystroke',
			keystroke: { keys: '', delayMs: 50 },
		},
		context: { enabled: false },
		source: 'user',
		createdAt: now,
		updatedAt: now,
	};
}
