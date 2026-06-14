import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error, event, status, message }) => {
	console.error('[SvelteKit Error]', { error, status, message, route: event.route?.id });
	return {
		message: error instanceof Error ? error.message : String(error),
	};
};
