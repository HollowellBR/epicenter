<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '@steno/ui/button';
	import * as Field from '@steno/ui/field';
	import { Input } from '@steno/ui/input';
	import * as Select from '@steno/ui/select';
	import { Switch } from '@steno/ui/switch';
	import { Textarea } from '@steno/ui/textarea';
	import { invoke } from '@tauri-apps/api/core';
	import { isErr } from 'wellcrafted/result';
	import { CloudCompletionServiceLive } from '$lib/services/isomorphic/completion/cloud';
	import { OllamaCompletionServiceLive } from '$lib/services/isomorphic/completion/ollama';
	import { LLM_MODELS } from '$lib/services/isomorphic/completion/local/qwen';
	import {
		CLOUD_PRESETS,
		CLOUD_PRESET_OPTIONS,
	} from '$lib/constants/inference/cloud-presets';
	import { llmDownload } from '$lib/state/llm-download.svelte';
	import { settings } from '$lib/state/settings.svelte';

	// Path to a llama-server binary bundled with the app, if one ships with it.
	let bundledServer = $state<string | null>(null);

	const PROVIDER_OPTIONS = [
		{ value: 'llamacpp', label: 'Bundled llama.cpp (recommended)' },
		{ value: 'ollama', label: 'Ollama (bring your own)' },
		{ value: 'cloud', label: 'Cloud (OpenAI-compatible)' },
	] as const;

	const provider = $derived(settings.value['completion.provider']);
	const providerLabel = $derived(
		PROVIDER_OPTIONS.find((o) => o.value === provider)?.label ?? 'Select',
	);

	// Cloud provider preset (Anthropic/OpenAI/Groq/OpenRouter/Custom).
	const cloudPreset = $derived(
		CLOUD_PRESETS.find((p) => p.id === settings.value['cloud.provider']) ??
			CLOUD_PRESETS[0],
	);
	const cloudPresetLabel = $derived(cloudPreset.label);

	const selectedLlm = $derived(
		LLM_MODELS.find((m) => m.id === settings.value['llamacpp.model']) ??
			LLM_MODELS[0],
	);
	const selectedLlmLabel = $derived(selectedLlm.name);

	// Ollama connection helpers (used when the Ollama provider is selected)
	let connectionStatus: 'idle' | 'testing' | 'success' | 'error' =
		$state('idle');
	let connectionMessage = $state('');

	async function testOllama() {
		connectionStatus = 'testing';
		connectionMessage = '';
		const result = await OllamaCompletionServiceLive.listModels(
			settings.value['ollama.baseUrl'],
		);
		if (isErr(result)) {
			connectionStatus = 'error';
			connectionMessage = result.error;
		} else {
			connectionStatus = 'success';
			connectionMessage = `Connected. ${result.data.length} model${result.data.length === 1 ? '' : 's'} available.`;
		}
	}

	async function testCloud() {
		connectionStatus = 'testing';
		connectionMessage = '';
		const baseUrl =
			(cloudPreset.id === 'Custom'
				? settings.value['cloud.baseUrl']
				: cloudPreset.baseUrl) || '';
		if (!baseUrl) {
			connectionStatus = 'error';
			connectionMessage = 'Set an endpoint URL first.';
			return;
		}
		const result = await CloudCompletionServiceLive.complete({
			baseUrl,
			apiKey: settings.value[cloudPreset.apiKeyField],
			model: settings.value['cloud.model'],
			systemPrompt: 'You are a connection test. Reply with OK.',
			userPrompt: 'ping',
		});
		if (isErr(result)) {
			connectionStatus = 'error';
			connectionMessage = result.error.message;
		} else {
			connectionStatus = 'success';
			connectionMessage = 'Connected. The cloud provider responded.';
		}
	}

	$effect(() => {
		// Re-check local model status only when the SELECTED model changes.
		// `untrack` keeps the store's internal settings reads from subscribing
		// this effect to every persisted-settings re-sync (which fires on window
		// focus / nav-link hover and used to reset download state).
		void settings.value['llamacpp.model'];
		untrack(() => llmDownload.refreshStatus(selectedLlm));
	});

	$effect(() => {
		// Detect whether a llama-server binary ships with the app (zero-setup).
		invoke<string | null>('resolve_bundled_llama_server')
			.then((path) => {
				bundledServer = path ?? null;
			})
			.catch(() => {
				bundledServer = null;
			});
	});
</script>

<svelte:head>
	<title>Transformation Settings - Steno</title>
</svelte:head>

<Field.Set>
	<Field.Legend>Transformation</Field.Legend>
	<Field.Description>
		Choose the local model that powers text transformations (grammar fixes,
		rewrites, and custom prompts).
	</Field.Description>
	<Field.Separator />
	<Field.Group>
		<Field.Field>
			<Field.Label for="completion-provider">Backend</Field.Label>
			<Field.Description>
				The bundled llama.cpp server runs Qwen3 locally with no extra install.
				Ollama is optional if you already run it. Cloud sends transcript text
				to an OpenAI-compatible API — faster, but it leaves your device.
			</Field.Description>
			<Select.Root
				type="single"
				bind:value={
					() => settings.value['completion.provider'],
					(v) =>
						settings.updateKey(
							'completion.provider',
							v as 'llamacpp' | 'ollama' | 'cloud',
						)
				}
			>
				<Select.Trigger id="completion-provider" class="w-full">
					{providerLabel}
				</Select.Trigger>
				<Select.Content>
					{#each PROVIDER_OPTIONS as opt}
						<Select.Item value={opt.value} label={opt.label} />
					{/each}
				</Select.Content>
			</Select.Root>
		</Field.Field>

		<Field.Separator />

		<Field.Field orientation="horizontal">
			<Switch
				id="completion-enable-thinking"
				bind:checked={
					() => settings.value['completion.enableThinking'],
					(v) => settings.updateKey('completion.enableThinking', v)
				}
			/>
			<Field.Content>
				<Field.Label for="completion-enable-thinking">Reasoning</Field.Label>
				<Field.Description>
					Let the model think before answering. Off is recommended —
					transforms like grammar fixes don't need it, and turning it on can
					make each transform several times slower.
				</Field.Description>
			</Field.Content>
		</Field.Field>

		{#if provider === 'llamacpp'}
			<Field.Separator />

			<Field.Field>
				<Field.Label for="llamacpp-model">Model</Field.Label>
				<Field.Description>
					Qwen3 8B is the most capable for following instructions; 4B is faster
					and lighter.
				</Field.Description>
				<Select.Root
					type="single"
					bind:value={
						() => settings.value['llamacpp.model'],
						(v) => settings.updateKey('llamacpp.model', v)
					}
				>
					<Select.Trigger id="llamacpp-model" class="w-full">
						{selectedLlmLabel}
					</Select.Trigger>
					<Select.Content>
						{#each LLM_MODELS as model}
							<Select.Item
								value={model.id}
								label="{model.name} — {model.size}"
							/>
						{/each}
					</Select.Content>
				</Select.Root>

				{#if llmDownload.state.type === 'ready'}
					<p class="text-sm text-success">
						{selectedLlm.name} is downloaded and ready.
					</p>
				{:else if llmDownload.state.type === 'downloading'}
					<p class="text-muted-foreground text-sm">
						Downloading… {llmDownload.state.progress}%
					</p>
				{:else if llmDownload.state.type === 'error'}
					<p class="text-destructive text-sm">{llmDownload.state.message}</p>
				{/if}

				<div>
					<Button
						variant="outline"
						loading={llmDownload.state.type === 'downloading'}
						disabled={llmDownload.state.type === 'downloading'}
						onclick={() => llmDownload.download(selectedLlm)}
					>
						{llmDownload.state.type === 'ready' ? 'Re-download' : 'Download'}
						{selectedLlm.size}
					</Button>
				</div>
			</Field.Field>

			<Field.Separator />

			<Field.Field>
				<Field.Label for="llamacpp-server-path">
					llama-server path (optional)
				</Field.Label>
				<Field.Description>
					{#if bundledServer}
						A llama-server binary ships with the app — no setup needed. It
						prefers your GPU (Vulkan/Metal) and falls back to CPU
						automatically. Set a path only to override it.
					{:else}
						No bundled binary detected. Set an absolute path to a prebuilt
						<code class="bg-muted rounded px-1">llama-server</code> (from a llama.cpp
						release).
					{/if}
				</Field.Description>
				<Input
					id="llamacpp-server-path"
					value={settings.value['llamacpp.serverPath']}
					oninput={(e) =>
						settings.updateKey('llamacpp.serverPath', e.currentTarget.value)}
					placeholder={bundledServer ?? '/path/to/llama-server'}
				/>
			</Field.Field>

			<Field.Separator />

			<Field.Field>
				<Field.Label for="llamacpp-default-prompt">
					Default Transformation Prompt
				</Field.Label>
				<Field.Description>
					System prompt used when a transformation step has no custom prompt.
				</Field.Description>
				<Textarea
					id="llamacpp-default-prompt"
					value={settings.value['llamacpp.defaultPrompt']}
					oninput={(e) =>
						settings.updateKey('llamacpp.defaultPrompt', e.currentTarget.value)}
					rows={3}
					placeholder="Fix grammar and punctuation"
				/>
			</Field.Field>
		{:else if provider === 'ollama'}
			<Field.Separator />

			<Field.Field>
				<Field.Label for="ollama-base-url">Endpoint URL</Field.Label>
				<Field.Description>
					The Ollama server address. Default is http://localhost:11434.
				</Field.Description>
				<div class="flex gap-2">
					<Input
						id="ollama-base-url"
						value={settings.value['ollama.baseUrl']}
						oninput={(e) =>
							settings.updateKey('ollama.baseUrl', e.currentTarget.value)}
						placeholder="http://localhost:11434"
						class="flex-1"
					/>
					<Button
						variant="outline"
						onclick={testOllama}
						loading={connectionStatus === 'testing'}
						disabled={connectionStatus === 'testing'}
					>
						Test
					</Button>
				</div>
				{#if connectionMessage}
					<p
						class={connectionStatus === 'error'
							? 'text-destructive text-sm'
							: 'text-sm text-success'}
					>
						{connectionMessage}
					</p>
				{/if}
			</Field.Field>

			<Field.Separator />

			<Field.Field>
				<Field.Label for="ollama-model">Model</Field.Label>
				<Field.Description>
					Pull a model first with <code class="bg-muted rounded px-1"
						>ollama pull &lt;model&gt;</code
					>. Qwen3 is recommended (e.g. <code class="bg-muted rounded px-1"
						>qwen3:8b</code
					>).
				</Field.Description>
				<Input
					id="ollama-model"
					value={settings.value['ollama.model']}
					oninput={(e) =>
						settings.updateKey('ollama.model', e.currentTarget.value)}
					placeholder="qwen3:8b"
				/>
			</Field.Field>

			<Field.Separator />

			<Field.Field>
				<Field.Label for="ollama-default-prompt">
					Default Transformation Prompt
				</Field.Label>
				<Field.Description>
					System prompt used when a transformation step has no custom prompt.
				</Field.Description>
				<Textarea
					id="ollama-default-prompt"
					value={settings.value['ollama.defaultPrompt']}
					oninput={(e) =>
						settings.updateKey('ollama.defaultPrompt', e.currentTarget.value)}
					rows={3}
					placeholder="Fix grammar and punctuation"
				/>
			</Field.Field>
		{:else}
			<Field.Separator />

			<div
				class="border-amber-500/40 bg-amber-500/10 text-foreground rounded-md border p-3 text-sm"
			>
				<strong>Heads up:</strong> with a cloud backend, the transcript text is
				sent to the provider you choose for cleanup. Audio and transcription
				stay on your device — only the transform step uses the cloud.
			</div>

			<Field.Field>
				<Field.Label for="cloud-provider">Provider</Field.Label>
				<Field.Description>
					Anthropic (Claude Haiku) is recommended — fast, low-cost, and strong
					on data privacy. Choose Custom for any other OpenAI-compatible API.
				</Field.Description>
				<Select.Root
					type="single"
					bind:value={
						() => settings.value['cloud.provider'],
						(v) => {
							const next =
								CLOUD_PRESETS.find((p) => p.id === v) ?? CLOUD_PRESETS[0];
							settings.updateKey('cloud.provider', next.id);
							// Seed a sensible default model when switching presets.
							if (next.defaultModel) {
								settings.updateKey('cloud.model', next.defaultModel);
							}
						}
					}
				>
					<Select.Trigger id="cloud-provider" class="w-full">
						{cloudPresetLabel}
					</Select.Trigger>
					<Select.Content>
						{#each CLOUD_PRESET_OPTIONS as opt}
							<Select.Item value={opt.value} label={opt.label} />
						{/each}
					</Select.Content>
				</Select.Root>
			</Field.Field>

			{#if cloudPreset.id === 'Custom'}
				<Field.Separator />

				<Field.Field>
					<Field.Label for="cloud-base-url">Endpoint URL</Field.Label>
					<Field.Description>
						Base URL of the OpenAI-compatible API (the part before
						<code class="bg-muted rounded px-1">/chat/completions</code>).
					</Field.Description>
					<Input
						id="cloud-base-url"
						value={settings.value['cloud.baseUrl']}
						oninput={(e) =>
							settings.updateKey('cloud.baseUrl', e.currentTarget.value)}
						placeholder="https://api.example.com/v1"
					/>
				</Field.Field>
			{/if}

			<Field.Separator />

			<Field.Field>
				<Field.Label for="cloud-api-key">API Key</Field.Label>
				<Field.Description>
					Stored locally on this device and sent only to the selected provider.
				</Field.Description>
				<div class="flex gap-2">
					<Input
						id="cloud-api-key"
						type="password"
						value={settings.value[cloudPreset.apiKeyField]}
						oninput={(e) =>
							settings.updateKey(cloudPreset.apiKeyField, e.currentTarget.value)}
						placeholder="sk-…"
						class="flex-1"
					/>
					<Button
						variant="outline"
						onclick={testCloud}
						loading={connectionStatus === 'testing'}
						disabled={connectionStatus === 'testing'}
					>
						Test
					</Button>
				</div>
				{#if connectionMessage}
					<p
						class={connectionStatus === 'error'
							? 'text-destructive text-sm'
							: 'text-sm text-success'}
					>
						{connectionMessage}
					</p>
				{/if}
			</Field.Field>

			<Field.Separator />

			<Field.Field>
				<Field.Label for="cloud-model">Model</Field.Label>
				<Field.Description>
					Exact model id for the provider (e.g.
					<code class="bg-muted rounded px-1">claude-haiku-4-5</code>).
				</Field.Description>
				<Input
					id="cloud-model"
					value={settings.value['cloud.model']}
					oninput={(e) =>
						settings.updateKey('cloud.model', e.currentTarget.value)}
					placeholder="claude-haiku-4-5"
				/>
			</Field.Field>

			<Field.Separator />

			<Field.Field orientation="horizontal">
				<Switch
					id="cloud-fallback"
					bind:checked={
						() => settings.value['completion.cloudFallbackToLocal'],
						(v) => settings.updateKey('completion.cloudFallbackToLocal', v)
					}
				/>
				<Field.Content>
					<Field.Label for="cloud-fallback">Fall back to local model</Field.Label>
					<Field.Description>
						If the cloud provider can't be reached (offline), run the transform
						on the bundled local model instead of failing. Authentication and
						rate-limit errors are always surfaced, never silently retried.
					</Field.Description>
				</Field.Content>
			</Field.Field>

			<Field.Separator />

			<Field.Field>
				<Field.Label for="cloud-default-prompt">
					Default Transformation Prompt
				</Field.Label>
				<Field.Description>
					System prompt used when a transformation step has no custom prompt.
				</Field.Description>
				<Textarea
					id="cloud-default-prompt"
					value={settings.value['cloud.defaultPrompt']}
					oninput={(e) =>
						settings.updateKey('cloud.defaultPrompt', e.currentTarget.value)}
					rows={3}
					placeholder="Fix grammar and punctuation"
				/>
			</Field.Field>
		{/if}
	</Field.Group>
</Field.Set>
