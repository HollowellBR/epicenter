import { extractErrorMessage } from 'wellcrafted/error';
import { tryAsync } from 'wellcrafted/result';
import type { PlaySoundService } from '.';
import { getAudioElement } from './assets';
import { PlaySoundServiceErr } from './types';

export function createPlaySoundServiceDesktop(): PlaySoundService {
	return {
		playSound: async (soundName) =>
			tryAsync({
				try: async () => {
					await getAudioElement(soundName).play();
				},
				catch: (error) =>
					PlaySoundServiceErr({
						message: `Failed to play sound: ${extractErrorMessage(error)}`,
					}),
			}),
	};
}
