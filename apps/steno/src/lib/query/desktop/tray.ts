import { Ok, type Result } from 'wellcrafted/result';
import type { StenoRecordingState } from '$lib/constants/audio';
import { defineMutation } from '$lib/query/client';
import { StenoErr, type StenoError } from '$lib/result';
import { desktopServices } from '$lib/services';

const setTrayIconKeys = {
	setTrayIcon: ['setTrayIcon', 'setTrayIcon'] as const,
};

export const tray = {
	setTrayIcon: defineMutation({
		mutationKey: setTrayIconKeys.setTrayIcon,
		mutationFn: async ({
			icon,
		}: {
			icon: StenoRecordingState;
		}): Promise<Result<void, StenoError>> => {
			const { data, error } = await desktopServices.tray.setTrayIcon(icon);

			if (error) {
				return StenoErr({
					title: '⚠️ Failed to set tray icon',
					serviceError: error,
				});
			}

			return Ok(data);
		},
	}),
};
