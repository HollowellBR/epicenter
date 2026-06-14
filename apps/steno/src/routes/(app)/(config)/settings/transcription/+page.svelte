<script lang="ts">
	import {
		CompressionBody,
	} from '$lib/components/settings';
	import LocalModelSelector from '$lib/components/settings/LocalModelSelector.svelte';
	import { SUPPORTED_LANGUAGES_OPTIONS } from '$lib/constants/languages';
	import { PARAKEET_MODELS } from '$lib/services/isomorphic/transcription/local/parakeet';
	import { TRANSCRIPTION_SERVICE_CAPABILITIES } from '$lib/services/isomorphic/transcription/registry';
	import { settings } from '$lib/state/settings.svelte';
	import InfoIcon from '@lucide/svelte/icons/info';
	import * as Alert from '@steno/ui/alert';
	import * as Card from '@steno/ui/card';
	import * as Field from '@steno/ui/field';
	import { Input } from '@steno/ui/input';
	import { Link } from '@steno/ui/link';
	import * as Select from '@steno/ui/select';
	import { Textarea } from '@steno/ui/textarea';
	import { hasNavigatorLocalTranscriptionIssue } from '$routes/(app)/_layout-utils/check-ffmpeg';

	const { data } = $props();

	/**
	 * Feature capabilities for the currently selected transcription service.
	 * Used to conditionally disable UI fields that aren't supported by the service.
	 */
	const currentServiceCapabilities = $derived(
		TRANSCRIPTION_SERVICE_CAPABILITIES[
			settings.value['transcription.selectedTranscriptionService']
		],
	);

	const outputLanguageLabel = $derived(
		SUPPORTED_LANGUAGES_OPTIONS.find(
			(i) => i.value === settings.value['transcription.outputLanguage'],
		)?.label,
	);
</script>

<svelte:head>
	<title>Transcription Settings - Steno</title>
</svelte:head>

<Field.Set>
	<Field.Legend>Transcription</Field.Legend>
	<Field.Description>
		Configure your Steno transcription preferences.
	</Field.Description>
	<Field.Separator />
	<Field.Group>
		<div class="space-y-4">
			<!-- Parakeet Model Selector Component -->
			{#if window.__TAURI_INTERNALS__}
				<LocalModelSelector
					models={PARAKEET_MODELS}
					title="Parakeet Model"
					description="Parakeet is an NVIDIA NeMo model optimized for fast local transcription. It automatically detects the language and doesn't support manual language selection."
					fileSelectionMode="directory"
					bind:value={
						() => settings.value['transcription.parakeet.modelPath'],
						(v) => settings.updateKey('transcription.parakeet.modelPath', v)
					}
				>
					{#snippet prebuiltFooter()}
						<p class="text-sm text-muted-foreground">
							Models are downloaded from{' '}
							<Link
								href="https://huggingface.co/istupakov/parakeet-tdt-0.6b-v2-onnx"
								target="_blank"
								rel="noopener noreferrer"
							>
								Hugging Face
							</Link>
							{' '}and stored in your app data directory. This is the
							full-precision (FP32) NVIDIA Parakeet TDT 0.6B v2 English
							model, tuned for the highest accuracy.
						</p>
					{/snippet}

					{#snippet manualInstructions()}
						<Card.Root class="bg-muted/50">
							<Card.Content class="p-4">
								<h4 class="mb-2 text-sm font-medium">
									Getting Parakeet Models
								</h4>
								<ul class="space-y-2 text-sm text-muted-foreground">
									<li class="flex items-start gap-2">
										<span
											class="mt-0.5 block size-1.5 rounded-full bg-muted-foreground/50"
										></span>
										<span>
											Download pre-built models from the "Pre-built Models"
											tab
										</span>
									</li>
									<li class="flex items-start gap-2">
										<span
											class="mt-0.5 block size-1.5 rounded-full bg-muted-foreground/50"
										></span>
										<span>
											Or download from{' '}
											<Link
												href="https://github.com/NVIDIA/NeMo"
												target="_blank"
												rel="noopener noreferrer"
											>
												NVIDIA NeMo
											</Link>
										</span>
									</li>
									<li class="flex items-start gap-2">
										<span
											class="mt-0.5 block size-1.5 rounded-full bg-muted-foreground/50"
										></span>
										<span>
											Parakeet models are directories containing ONNX files
										</span>
									</li>
								</ul>
							</Card.Content>
						</Card.Root>
					{/snippet}
				</LocalModelSelector>

				{#if hasNavigatorLocalTranscriptionIssue( { isFFmpegInstalled: data.ffmpegInstalled ?? false }, )}
					<Alert.Root variant="destructive">
						<InfoIcon />
						<Alert.Title>
							Browser API Recording Requires FFmpeg
						</Alert.Title>
						<Alert.Description>
							You're using the Browser API recording method, which produces
							compressed audio that requires FFmpeg for Parakeet
							transcription.
							<div class="mt-3 space-y-3">
								<div class="text-sm">
									<strong>Option 1:</strong>
									<Link href="/settings/recording"
										>Switch to CPAL recording</Link
									>
									for direct compatibility with local transcription
								</div>
								<div class="text-sm">
									<strong>Option 2:</strong>
									<Link href="/settings/recording">Install FFmpeg</Link>
									to keep using Browser API recording
								</div>
							</div>
						</Alert.Description>
					</Alert.Root>
				{/if}
			{/if}
		</div>

		<!-- Audio Compression Settings -->
		<CompressionBody />

		<Field.Field>
			<Field.Label for="output-language">Output Language</Field.Label>
			<Select.Root
				type="single"
				bind:value={
					() => settings.value['transcription.outputLanguage'],
					(v) => settings.updateKey('transcription.outputLanguage', v)
				}
				disabled={!currentServiceCapabilities.supportsLanguage}
			>
				<Select.Trigger id="output-language" class="w-full">
					{outputLanguageLabel ?? 'Select a language'}
				</Select.Trigger>
				<Select.Content>
					{#each SUPPORTED_LANGUAGES_OPTIONS as item}
						<Select.Item value={item.value} label={item.label} />
					{/each}
				</Select.Content>
			</Select.Root>
			{#if !currentServiceCapabilities.supportsLanguage}
				<Field.Description>
					Parakeet automatically detects the language
				</Field.Description>
			{/if}
		</Field.Field>

		<Field.Field>
			<Field.Label for="temperature">Temperature</Field.Label>
			<Input
				id="temperature"
				type="number"
				min="0"
				max="1"
				step="0.1"
				placeholder="0"
				autocomplete="off"
				disabled={!currentServiceCapabilities.supportsTemperature}
				bind:value={
					() => settings.value['transcription.temperature'],
					(value) =>
						settings.updateKey('transcription.temperature', String(value))
				}
			/>
			<Field.Description>
				{currentServiceCapabilities.supportsTemperature
					? "Controls randomness in the model's output. 0 is focused and deterministic, 1 is more creative."
					: 'Temperature is not supported for local models (transcribe-rs)'}
			</Field.Description>
		</Field.Field>

		<Field.Field>
			<Field.Label for="transcription-prompt">System Prompt</Field.Label>
			<Textarea
				id="transcription-prompt"
				placeholder="e.g., This is an academic lecture about quantum physics with technical terms like 'eigenvalue' and 'Schrödinger'"
				disabled={!currentServiceCapabilities.supportsPrompt}
				bind:value={
					() => settings.value['transcription.prompt'],
					(value) => settings.updateKey('transcription.prompt', value)
				}
			/>
			<Field.Description>
				{currentServiceCapabilities.supportsPrompt
					? 'Helps transcription service better recognize specific terms, names, or context during initial transcription.'
					: 'System prompt is not supported for local models (Parakeet)'}
			</Field.Description>
		</Field.Field>
	</Field.Group>
</Field.Set>
