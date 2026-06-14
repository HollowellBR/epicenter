import { type } from 'arktype';
import { nanoid } from 'nanoid/non-secure';
import type { VoiceCommand } from '$lib/services/isomorphic/db/models/voice-commands';
import type { ShellAllowlistEntry } from '$lib/services/isomorphic/db/models/shell-allowlist';

// ── JSON File Schema ────────────────────────────────────────────

const JsonKeystrokeAction = type({
	type: "'keystroke'",
	keys: 'string',
	'delayMs?': 'number',
});

const JsonAppAction = type({
	type: "'app_action'",
	name: 'string',
});

const JsonShellAction = type({
	type: "'shell'",
	commandId: 'string',
});

const JsonAction = JsonKeystrokeAction.or(JsonAppAction).or(JsonShellAction);

const JsonContext = type({
	'enabled?': 'boolean',
	'windowTitlePattern?': 'string',
	'processNamePattern?': 'string',
});

const JsonCommand = type({
	title: 'string',
	'description?': 'string',
	'enabled?': 'boolean',
	phrases: 'string[]',
	action: JsonAction,
	'context?': JsonContext,
});

const JsonShellEntry = type({
	title: 'string',
	command: 'string',
	'args?': 'string[]',
	'description?': 'string',
});

export const CommandFileSchema = type({
	'commands?': JsonCommand.array(),
	'shellAllowlist?': JsonShellEntry.array(),
});

export type CommandFile = typeof CommandFileSchema.infer;

// ── Conversion Helpers ──────────────────────────────────────────

function jsonCommandToVoiceCommand(
	cmd: CommandFile['commands'] extends (infer T)[] | undefined ? T : never,
	source: VoiceCommand['source'],
): VoiceCommand {
	const now = new Date().toISOString();
	const action = cmd.action;

	return {
		id: nanoid(),
		title: cmd.title,
		description: cmd.description ?? '',
		enabled: cmd.enabled ?? true,
		phrases: cmd.phrases,
		action: {
			type: action.type,
			...(action.type === 'keystroke' && {
				keystroke: {
					keys: action.keys,
					delayMs: action.delayMs ?? 50,
				},
			}),
			...(action.type === 'app_action' && {
				appAction: { name: action.name },
			}),
			...(action.type === 'shell' && {
				shell: { commandId: action.commandId },
			}),
		},
		context: {
			enabled: cmd.context?.enabled ?? false,
			...(cmd.context?.windowTitlePattern && {
				windowTitlePattern: cmd.context.windowTitlePattern,
			}),
			...(cmd.context?.processNamePattern && {
				processNamePattern: cmd.context.processNamePattern,
			}),
		},
		source,
		createdAt: now,
		updatedAt: now,
	};
}

function jsonEntryToShellAllowlist(
	entry: NonNullable<CommandFile['shellAllowlist']>[number],
): ShellAllowlistEntry {
	const now = new Date().toISOString();
	return {
		id: nanoid(),
		title: entry.title,
		command: entry.command,
		args: entry.args ?? [],
		description: entry.description ?? '',
		createdAt: now,
		updatedAt: now,
	};
}

// ── Parse & Validate ────────────────────────────────────────────

/**
 * Parses a JSON string into a validated CommandFile.
 * Returns null if parsing or validation fails.
 */
export function parseCommandFile(json: string): CommandFile | null {
	try {
		const parsed = JSON.parse(json);
		const result = CommandFileSchema(parsed);
		if (result instanceof type.errors) return null;
		return result;
	} catch {
		return null;
	}
}

/**
 * Converts a validated CommandFile into arrays of VoiceCommand and ShellAllowlistEntry.
 */
export function commandFileToEntities(
	file: CommandFile,
	source: VoiceCommand['source'] = 'json_file',
): {
	commands: VoiceCommand[];
	shellEntries: ShellAllowlistEntry[];
} {
	return {
		commands: (file.commands ?? []).map((cmd) =>
			jsonCommandToVoiceCommand(cmd, source),
		),
		shellEntries: (file.shellAllowlist ?? []).map(jsonEntryToShellAllowlist),
	};
}

// ── Export ───────────────────────────────────────────────────────

/**
 * Serializes voice commands and shell allowlist entries to a JSON string.
 */
export function entitiesToCommandFileJson(
	commands: VoiceCommand[],
	shellEntries: ShellAllowlistEntry[],
): string {
	const file: CommandFile = {
		commands: commands.map((cmd) => {
			const base: Record<string, unknown> = {
				title: cmd.title,
				phrases: cmd.phrases,
				action: buildJsonAction(cmd),
			};
			if (cmd.description) base.description = cmd.description;
			if (!cmd.enabled) base.enabled = false;
			if (cmd.context.enabled) {
				base.context = {
					enabled: true,
					...(cmd.context.windowTitlePattern && {
						windowTitlePattern: cmd.context.windowTitlePattern,
					}),
					...(cmd.context.processNamePattern && {
						processNamePattern: cmd.context.processNamePattern,
					}),
				};
			}
			return base as NonNullable<CommandFile['commands']>[number];
		}),
		shellAllowlist: shellEntries.map((entry) => ({
			title: entry.title,
			command: entry.command,
			...(entry.args.length > 0 && { args: entry.args }),
			...(entry.description && { description: entry.description }),
		})),
	};
	return JSON.stringify(file, null, 2);
}

function buildJsonAction(cmd: VoiceCommand) {
	switch (cmd.action.type) {
		case 'keystroke':
			return {
				type: 'keystroke' as const,
				keys: cmd.action.keystroke?.keys ?? '',
				...(cmd.action.keystroke?.delayMs &&
					cmd.action.keystroke.delayMs !== 50 && {
						delayMs: cmd.action.keystroke.delayMs,
					}),
			};
		case 'app_action':
			return {
				type: 'app_action' as const,
				name: cmd.action.appAction?.name ?? '',
			};
		case 'shell':
			return {
				type: 'shell' as const,
				commandId: cmd.action.shell?.commandId ?? '',
			};
	}
}

// ── Builtin Defaults ────────────────────────────────────────────

/**
 * Returns the set of builtin default voice commands.
 * Uses Ctrl on Windows/Linux, Cmd on macOS.
 */
export function getBuiltinDefaults(isMacos: boolean): CommandFile {
	const mod = isMacos ? 'Meta' : 'Ctrl';

	return {
		commands: [
			{
				title: 'Start Recording',
				phrases: ['start recording', 'begin recording'],
				action: { type: 'app_action', name: 'startManualRecording' },
			},
			{
				title: 'Stop Recording',
				phrases: ['stop recording', 'end recording'],
				action: { type: 'app_action', name: 'stopManualRecording' },
			},
			{
				title: 'Cancel Recording',
				phrases: ['cancel recording', 'discard recording'],
				action: { type: 'app_action', name: 'cancelManualRecording' },
			},
			{
				title: 'Save File',
				phrases: ['save file', 'save'],
				action: { type: 'keystroke', keys: `${mod}+S` },
			},
			{
				title: 'Undo',
				phrases: ['undo', 'undo that'],
				action: { type: 'keystroke', keys: `${mod}+Z` },
			},
			{
				title: 'Copy',
				phrases: ['copy', 'copy that'],
				action: { type: 'keystroke', keys: `${mod}+C` },
			},
			{
				title: 'Paste',
				phrases: ['paste'],
				action: { type: 'keystroke', keys: `${mod}+V` },
			},
		],
	};
}
