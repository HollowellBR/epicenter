import { APPS } from '@steno/constants/vite';

/**
 * URL and pathname constants for the Steno application
 */
export const STENO_URL = APPS.AUDIO.URL;

export const STENO_URL_WILDCARD = `${STENO_URL}/*` as const;

export const STENO_RECORDINGS_PATHNAME = '/recordings' as const;

export const STENO_SETTINGS_PATHNAME = '/settings' as const;
