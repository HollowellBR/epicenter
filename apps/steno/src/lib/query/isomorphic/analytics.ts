import { Ok, type Result } from 'wellcrafted/result';
import { defineMutation } from '$lib/query/client';
import type { Event } from '$lib/services/isomorphic/analytics/types';

const analyticsKeys = {
	logEvent: ['analytics', 'logEvent'] as const,
} as const;

/**
 * Analytics query layer that handles business logic for event logging.
 * Checks settings to determine if analytics is enabled before sending events.
 */
export const analytics = {
	/**
	 * Log an anonymous analytics event (no-op in this fork)
	 */
	logEvent: defineMutation({
		mutationKey: analyticsKeys.logEvent,
		mutationFn: async (_event: Event): Promise<Result<void, never>> => {
			return Ok(undefined);
		},
	}),
};
