import type { VoiceCommand } from '$lib/services/isomorphic/db/models/voice-commands';

export type CommandMatchResult = {
	command: VoiceCommand;
	phrase: string;
	similarity: number;
};

export type PrefixDetectionResult = {
	detected: boolean;
	/** Text after the prefix keyword, ready for command matching */
	commandText: string;
};
