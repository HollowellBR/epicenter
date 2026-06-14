import type { VoiceCommand } from '$lib/services/isomorphic/db/models/voice-commands';
import { levenshteinSimilarity } from './levenshtein';
import type { CommandMatchResult, PrefixDetectionResult } from './types';

/** Normalize text for comparison: lowercase, trim, collapse whitespace */
function normalize(text: string): string {
	return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Detects whether the transcribed text starts with the prefix keyword.
 * Supports exact and fuzzy matching on the first word(s).
 */
export function detectPrefix(
	text: string,
	prefixKeyword: string,
	fuzzyEnabled: boolean,
	threshold: number,
): PrefixDetectionResult {
	const normalized = normalize(text);
	const normalizedPrefix = normalize(prefixKeyword);

	if (!normalized || !normalizedPrefix) {
		return { detected: false, commandText: '' };
	}

	// Split into words to match prefix (prefix may be multi-word)
	const prefixWordCount = normalizedPrefix.split(' ').length;
	const words = normalized.split(' ');

	if (words.length < prefixWordCount) {
		return { detected: false, commandText: '' };
	}

	const candidatePrefix = words.slice(0, prefixWordCount).join(' ');
	const remainder = words.slice(prefixWordCount).join(' ');

	// Exact match
	if (candidatePrefix === normalizedPrefix) {
		return { detected: true, commandText: remainder };
	}

	// Fuzzy match
	if (fuzzyEnabled) {
		const similarity = levenshteinSimilarity(candidatePrefix, normalizedPrefix);
		if (similarity >= threshold) {
			return { detected: true, commandText: remainder };
		}
	}

	return { detected: false, commandText: '' };
}

/**
 * Matches command text against registered voice commands.
 * Tries exact match first, then Levenshtein fuzzy fallback.
 * Returns the best match or null.
 */
export function matchCommand(
	commandText: string,
	commands: VoiceCommand[],
	fuzzyThreshold: number,
): CommandMatchResult | null {
	const normalizedInput = normalize(commandText);

	if (!normalizedInput) return null;

	let bestMatch: CommandMatchResult | null = null;

	for (const command of commands) {
		if (!command.enabled) continue;

		for (const phrase of command.phrases) {
			const normalizedPhrase = normalize(phrase);
			if (!normalizedPhrase) continue;

			// Exact match — return immediately
			if (normalizedInput === normalizedPhrase) {
				return { command, phrase, similarity: 1 };
			}

			// Fuzzy match — track best
			const similarity = levenshteinSimilarity(normalizedInput, normalizedPhrase);
			if (similarity >= fuzzyThreshold) {
				if (!bestMatch || similarity > bestMatch.similarity) {
					bestMatch = { command, phrase, similarity };
				}
			}
		}
	}

	return bestMatch;
}
