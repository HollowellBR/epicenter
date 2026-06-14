import {
	TRANSCRIPTION_SERVICES,
	type TranscriptionService,
} from '$lib/services/isomorphic/transcription/registry';
import { settings } from '$lib/state/settings.svelte';

/**
 * Gets the currently selected transcription service.
 * Returns undefined if the service is not available on this platform.
 *
 * @returns The selected transcription service, or undefined if none selected or invalid
 */
export function getSelectedTranscriptionService():
	| TranscriptionService
	| undefined {
	const selectedServiceId =
		settings.value['transcription.selectedTranscriptionService'];
	return TRANSCRIPTION_SERVICES.find((s) => s.id === selectedServiceId);
}

/**
 * Checks if a transcription service has all required configuration.
 *
 * @param service - The transcription service to check
 * @returns true if the service is properly configured, false otherwise
 */
export function isTranscriptionServiceConfigured(
	service: TranscriptionService,
): boolean {
	const modelPath = settings.value[service.modelPathField];
	return modelPath !== '';
}
