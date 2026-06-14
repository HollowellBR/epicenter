import { Ok } from 'wellcrafted/result';
import type { AnalyticsService } from './types';

export function createAnalyticsServiceWeb(): AnalyticsService {
	return {
		logEvent: async () => Ok(undefined),
	};
}
