<script lang="ts">
	import * as Dialog from '@steno/ui/dialog';
	// import { extension } from '@steno/extension';
	import { createQuery } from '@tanstack/svelte-query';
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { commandCallbacks } from '$lib/commands';
	import ConfirmationDialog from '$lib/components/ConfirmationDialog.svelte';
	import MoreDetailsDialog from '$lib/components/MoreDetailsDialog.svelte';
	import NotificationLog from '$lib/components/NotificationLog.svelte';
	import UpdateDialog from '$lib/components/UpdateDialog.svelte';
	import { rpc } from '$lib/query';
	import { vadRecorder } from '$lib/state/vad-recorder.svelte';
	import { services } from '$lib/services';
	import { settings } from '$lib/state/settings.svelte';
	import { syncWindowAlwaysOnTopWithRecorderState } from '../_layout-utils/alwaysOnTop.svelte';
	import {
		checkCompressionRecommendation,
		checkFfmpegRecordingMethodCompatibility,
	} from '../_layout-utils/check-ffmpeg';
	import { checkForUpdates } from '../_layout-utils/check-for-updates';
	import { checkIndexedDBMigration } from '../_layout-utils/check-indexeddb-migration';
	import {
		resetGlobalShortcutsToDefaultIfDuplicates,
		resetLocalShortcutsToDefaultIfDuplicates,
		syncGlobalShortcutsWithSettings,
		syncLocalShortcutsWithSettings,
	} from '../_layout-utils/register-commands';
	import {
		registerAccessibilityPermission,
		registerMicrophonePermission,
	} from '../_layout-utils/register-permissions';
	import { syncIconWithRecorderState } from '../_layout-utils/syncIconWithRecorderState.svelte';
	import { registerOnboarding } from '../_layout-utils/register-onboarding';
	import { registerWakeWord } from '../_layout-utils/register-wakeword';
	import { seedVoiceCommandDefaults } from '../_layout-utils/seed-voice-commands';

	const getRecorderStateQuery = createQuery(
		() => rpc.recorder.getRecorderState.options,
	);

	let cleanupAccessibilityPermission: (() => void) | undefined;
	let cleanupMicrophonePermission: (() => void) | undefined;
	let cleanupWakeWord: (() => void) | undefined;

	onMount(() => {
		// Sync operations - run immediately, these are fast
		window.commands = commandCallbacks;
		window.goto = goto;
		syncLocalShortcutsWithSettings();
		resetLocalShortcutsToDefaultIfDuplicates();
		registerOnboarding();
		cleanupAccessibilityPermission = registerAccessibilityPermission();
		cleanupMicrophonePermission = registerMicrophonePermission();

		if (window.__TAURI_INTERNALS__) {
			syncGlobalShortcutsWithSettings();
			resetGlobalShortcutsToDefaultIfDuplicates();

			// Async operations - fire and forget, don't block UI rendering
			// These show toasts/notifications on completion, no need to await
			Promise.allSettled([
				checkFfmpegRecordingMethodCompatibility(),
				checkCompressionRecommendation(),
				checkForUpdates(),
				checkIndexedDBMigration(),
				seedVoiceCommandDefaults(),
			]);

			// Register wake word listener
			registerWakeWord().then((cleanup) => {
				cleanupWakeWord = cleanup;
			});
		} else {
			// Browser extension context - notify that the Steno tab is ready
			// extension.notifyStenoTabReady(undefined);
		}
	});

	onDestroy(() => {
		cleanupAccessibilityPermission?.();
		cleanupMicrophonePermission?.();
		cleanupWakeWord?.();
	});

	if (window.__TAURI_INTERNALS__) {
		syncWindowAlwaysOnTopWithRecorderState();
		syncIconWithRecorderState();
	}

	$effect(() => {
		getRecorderStateQuery.data;
		vadRecorder.state; // Reactive VAD state access
		services.db.recordings.cleanupExpired({
			recordingRetentionStrategy:
				settings.value['database.recordingRetentionStrategy'],
			maxRecordingCount: settings.value['database.maxRecordingCount'],
		});
	});

	let { children } = $props();
</script>

<button
	class="xxs:hidden hover:bg-accent hover:text-accent-foreground h-screen w-screen transform duration-300 ease-in-out"
	onclick={() => commandCallbacks.toggleManualRecording()}
	aria-label={getRecorderStateQuery.data === 'RECORDING'
		? 'Stop recording'
		: 'Start recording'}
>
	<span
		aria-hidden="true"
		style="filter: drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.5));"
		class="text-[48px] leading-none"
	>
		{#if getRecorderStateQuery.data === 'RECORDING'}
			⏹️
		{:else}
			🎙️
		{/if}
	</span>
</button>

<div class="hidden flex-1 flex-col gap-2 xxs:flex min-w-0 w-full">
	{@render children()}
</div>

<ConfirmationDialog />
<MoreDetailsDialog />
<NotificationLog />
<UpdateDialog />
