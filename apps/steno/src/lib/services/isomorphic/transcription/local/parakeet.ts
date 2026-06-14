import { invoke } from '@tauri-apps/api/core';
import { exists, stat } from '@tauri-apps/plugin-fs';
import { type } from 'arktype';
import { extractErrorMessage } from 'wellcrafted/error';
import { Ok, type Result, tryAsync } from 'wellcrafted/result';
import { StenoErr, type StenoError } from '$lib/result';
import type { ParakeetModelConfig } from './types';

/**
 * Pre-built Parakeet models available for download from GitHub releases.
 * These are NVIDIA NeMo models consisting of multiple ONNX files.
 */
export const PARAKEET_MODELS = [
	{
		id: 'parakeet-tdt-0.6b-v2-fp32',
		name: 'Parakeet TDT 0.6B v2 (FP32, English)',
		description:
			'Full-precision NVIDIA NeMo model — highest English accuracy at real-time speed',
		size: '~2.5 GB',
		sizeBytes: 2_513_132_330, // Total size of all individual files
		engine: 'parakeet',
		directoryName: 'parakeet-tdt-0.6b-v2-fp32',
		files: [
			{
				url: 'https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/config.json',
				filename: 'config.json',
				sizeBytes: 97,
			},
			{
				url: 'https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/encoder-model.onnx',
				filename: 'encoder-model.onnx',
				sizeBytes: 41_770_866,
			},
			{
				// ONNX external-data weights for the encoder; must sit next to encoder-model.onnx
				url: 'https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/encoder-model.onnx.data',
				filename: 'encoder-model.onnx.data',
				sizeBytes: 2_435_420_160,
			},
			{
				url: 'https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/decoder_joint-model.onnx',
				filename: 'decoder_joint-model.onnx',
				sizeBytes: 35_792_059,
			},
			{
				url: 'https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/nemo128.onnx',
				filename: 'nemo128.onnx',
				sizeBytes: 139_764,
			},
			{
				url: 'https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx/resolve/main/vocab.txt',
				filename: 'vocab.txt',
				sizeBytes: 9_384,
			},
		],
	},
] as const satisfies readonly ParakeetModelConfig[];

const ParakeetErrorType = type({
	name: "'AudioReadError' | 'FfmpegNotFoundError' | 'ModelLoadError' | 'TranscriptionError'",
	message: 'string',
});

export const ParakeetTranscriptionServiceLive = {
	async transcribe(
		audioBlob: Blob,
		options: { modelPath: string },
	): Promise<Result<string, StenoError>> {
		// Pre-validation
		if (!options.modelPath) {
			return StenoErr({
				title: '📁 Model Directory Required',
				description: 'Please select a Parakeet model directory in settings.',
				action: {
					type: 'link',
					label: 'Configure model',
					href: '/settings/transcription',
				},
			});
		}

		// Check if model directory exists
		const { data: isExists } = await tryAsync({
			try: () => exists(options.modelPath),
			catch: () => Ok(false),
		});

		if (!isExists) {
			return StenoErr({
				title: '❌ Model Directory Not Found',
				description: `The model directory "${options.modelPath}" does not exist.`,
				action: {
					type: 'link',
					label: 'Select model',
					href: '/settings/transcription',
				},
			});
		}

		// Check if it's actually a directory
		const { data: stats } = await tryAsync({
			try: () => stat(options.modelPath),
			catch: () => Ok(null),
		});

		if (!stats || !stats.isDirectory) {
			return StenoErr({
				title: '❌ Invalid Model Path',
				description:
					'Parakeet models must be directories containing model files.',
				action: {
					type: 'link',
					label: 'Select model directory',
					href: '/settings/transcription',
				},
			});
		}

		// Convert audio blob to byte array
		const arrayBuffer = await audioBlob.arrayBuffer();
		const audioData = Array.from(new Uint8Array(arrayBuffer));

		// Call Tauri command to transcribe with Parakeet
		// Note: Parakeet doesn't support language selection, temperature, or prompt
		const result = await tryAsync({
			try: () =>
				invoke<string>('transcribe_audio_parakeet', {
					audioData: audioData,
					modelPath: options.modelPath,
				}),
			catch: (unknownError) => {
				const result = ParakeetErrorType(unknownError);
				if (result instanceof type.errors) {
					return StenoErr({
						title: '❌ Unexpected Parakeet Error',
						description: extractErrorMessage(unknownError),
						action: { type: 'more-details', error: unknownError },
					});
				}
				const error = result;

				switch (error.name) {
					case 'ModelLoadError':
						return StenoErr({
							title: '🤖 Model Loading Error',
							description: error.message,
							action: {
								type: 'more-details',
								error: new Error(error.message),
							},
						});

					case 'FfmpegNotFoundError':
						return StenoErr({
							title: '🛠️ FFmpeg Not Installed',
							description:
								'Parakeet requires FFmpeg to convert audio formats. Please install FFmpeg or switch to CPAL recording at 16kHz.',
							action: {
								type: 'link',
								label: 'Recording Settings',
								href: '/settings/recording',
							},
						});

					case 'AudioReadError':
						return StenoErr({
							title: '🔊 Audio Read Error',
							description: error.message,
							action: {
								type: 'more-details',
								error: new Error(error.message),
							},
						});

					case 'TranscriptionError':
						return StenoErr({
							title: '❌ Transcription Error',
							description: error.message,
							action: {
								type: 'more-details',
								error: new Error(error.message),
							},
						});

					default:
						return StenoErr({
							title: '❌ Parakeet Error',
							description: 'An unexpected error occurred.',
							action: {
								type: 'more-details',
								error: new Error(String(error)),
							},
						});
				}
			},
		});

		return result;
	},
};

export type ParakeetTranscriptionService =
	typeof ParakeetTranscriptionServiceLive;
