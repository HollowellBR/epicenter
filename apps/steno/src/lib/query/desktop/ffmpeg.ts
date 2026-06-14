import { Ok } from 'wellcrafted/result';
import { defineQuery } from '$lib/query/client';
import { StenoErr } from '$lib/result';
import { desktopServices } from '$lib/services';

export const ffmpeg = {
	checkFfmpegInstalled: defineQuery({
		queryKey: ['ffmpeg.checkInstalled'],
		queryFn: async () => {
			const { data, error } = await desktopServices.ffmpeg.checkInstalled();
			if (error) {
				return StenoErr({
					title: '❌ Error checking FFmpeg installation',
					serviceError: error,
				});
			}
			return Ok(data);
		},
	}),
};
