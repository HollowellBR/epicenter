import { Ok, type Result } from 'wellcrafted/result';
import { defineMutation } from '$lib/query/client';
import { StenoErr, type StenoError } from '$lib/result';
import { desktopServices } from '$lib/services';

export const wakeword = {
	start: defineMutation({
		mutationKey: ['wakeword', 'start'] as const,
		mutationFn: async ({
			scriptPath,
			threshold,
		}: {
			scriptPath: string;
			threshold: number;
		}): Promise<Result<void, StenoError>> => {
			const { error } = await desktopServices.wakeword.startWakeWord(
				scriptPath,
				threshold,
			);
			if (error) {
				return StenoErr({
					title: 'Failed to start wake word detection',
					serviceError: error,
				});
			}
			return Ok(undefined);
		},
	}),

	stop: defineMutation({
		mutationKey: ['wakeword', 'stop'] as const,
		mutationFn: async (): Promise<Result<void, StenoError>> => {
			const { error } = await desktopServices.wakeword.stopWakeWord();
			if (error) {
				return StenoErr({
					title: 'Failed to stop wake word detection',
					serviceError: error,
				});
			}
			return Ok(undefined);
		},
	}),

	setThreshold: defineMutation({
		mutationKey: ['wakeword', 'setThreshold'] as const,
		mutationFn: async ({
			threshold,
		}: {
			threshold: number;
		}): Promise<Result<void, StenoError>> => {
			const { error } =
				await desktopServices.wakeword.setThreshold(threshold);
			if (error) {
				return StenoErr({
					title: 'Failed to update wake word threshold',
					serviceError: error,
				});
			}
			return Ok(undefined);
		},
	}),
};
