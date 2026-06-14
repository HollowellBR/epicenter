import { Ok } from 'wellcrafted/result';
import type { AnalyticsService } from './types';

export function createAnalyticsServiceDesktop(): AnalyticsService {
	return {
		logEvent: async () => Ok(undefined),
	};
}
