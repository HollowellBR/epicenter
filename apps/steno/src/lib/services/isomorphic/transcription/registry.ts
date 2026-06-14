/**
 * Transcription service configurations — simplified to local-only (Parakeet)
 */

import nvidiaIcon from '$lib/constants/icons/nvidia.svg?raw';

export const TRANSCRIPTION_SERVICE_IDS = ['parakeet'] as const;

export type TranscriptionServiceId = (typeof TRANSCRIPTION_SERVICE_IDS)[number];

type BaseTranscriptionService = {
	id: TranscriptionServiceId;
	name: string;
	icon: string;
	invertInDarkMode: boolean;
	description?: string;
};

type LocalTranscriptionService = BaseTranscriptionService & {
	location: 'local';
	modelPathField: string;
};

type SatisfiedTranscriptionService = LocalTranscriptionService;

export const TRANSCRIPTION_SERVICES = [
	{
		id: 'parakeet',
		name: 'Parakeet',
		icon: nvidiaIcon,
		invertInDarkMode: false,
		description: 'NVIDIA NeMo model for fast local transcription',
		modelPathField: 'transcription.parakeet.modelPath',
		location: 'local',
	},
] as const satisfies SatisfiedTranscriptionService[];

export const TRANSCRIPTION_SERVICE_OPTIONS = TRANSCRIPTION_SERVICES.map(
	(service) => ({
		label: service.name,
		value: service.id,
	}),
);

export const TRANSCRIPTION_SERVICE_ID_TO_LABEL = Object.fromEntries(
	TRANSCRIPTION_SERVICES.map((s) => [s.id, s.name]),
) as Record<TranscriptionServiceId, string>;

export type TranscriptionService = (typeof TRANSCRIPTION_SERVICES)[number];

type ServiceCapabilities = {
	supportsPrompt: boolean;
	supportsTemperature: boolean;
	supportsLanguage: boolean;
};

export const TRANSCRIPTION_SERVICE_CAPABILITIES = {
	parakeet: {
		supportsPrompt: false,
		supportsTemperature: false,
		supportsLanguage: false,
	},
} as const satisfies Record<TranscriptionServiceId, ServiceCapabilities>;
