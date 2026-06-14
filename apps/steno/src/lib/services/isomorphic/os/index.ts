import { createOsServiceDesktop } from './desktop';
import { createOsServiceWeb } from './web';

export type { ForegroundWindowInfo, OsService, OsServiceError } from './types';

export const OsServiceLive = window.__TAURI_INTERNALS__
	? createOsServiceDesktop()
	: createOsServiceWeb();
