<script lang="ts">
	import { Button } from '@steno/ui/button';
	import { Label } from '@steno/ui/label';
	import { Input } from '@steno/ui/input';
	import { Switch } from '@steno/ui/switch';
	import { settings } from '$lib/state/settings.svelte';
</script>

<svelte:head>
	<title>Voice Commands Settings</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h3 class="text-lg font-medium">Voice Commands</h3>
		<p class="text-muted-foreground text-sm">
			Speak commands prefixed with a keyword to trigger keystrokes, app
			actions, or shell commands.
		</p>
	</div>

	<div class="flex items-center justify-between rounded-lg border p-4">
		<div class="space-y-0.5">
			<Label>Manage commands</Label>
			<p class="text-muted-foreground text-sm">
				Create voice commands and define what each one does (keystroke, app
				action, or an allowlisted shell command).
			</p>
		</div>
		<Button href="/voice-commands" variant="outline">Open Voice Commands</Button>
	</div>

	<div class="space-y-4">
		<div class="flex items-center justify-between rounded-lg border p-4">
			<div class="space-y-0.5">
				<Label>Enable Voice Commands</Label>
				<p class="text-muted-foreground text-sm">
					When enabled, transcriptions starting with the prefix keyword will
					be intercepted and executed as commands.
				</p>
			</div>
			<Switch
				checked={settings.value['voiceCommands.enabled']}
				onCheckedChange={(checked) =>
					settings.updateKey('voiceCommands.enabled', checked)}
			/>
		</div>

		<div class="space-y-2">
			<Label for="prefix-keyword">Prefix Keyword</Label>
			<p class="text-muted-foreground text-sm">
				Say this word before a command to trigger it (e.g., "Steno save
				file").
			</p>
			<Input
				id="prefix-keyword"
				value={settings.value['voiceCommands.prefixKeyword']}
				oninput={(e) =>
					settings.updateKey(
						'voiceCommands.prefixKeyword',
						e.currentTarget.value,
					)}
				placeholder="steno"
				class="max-w-xs"
			/>
		</div>

		<div class="flex items-center justify-between rounded-lg border p-4">
			<div class="space-y-0.5">
				<Label>Fuzzy Prefix Matching</Label>
				<p class="text-muted-foreground text-sm">
					Allow slight mispronunciations of the prefix keyword (e.g.,
					"Stenno" still matches "Steno").
				</p>
			</div>
			<Switch
				checked={settings.value['voiceCommands.prefixFuzzyEnabled']}
				onCheckedChange={(checked) =>
					settings.updateKey('voiceCommands.prefixFuzzyEnabled', checked)}
			/>
		</div>

		<div class="space-y-2">
			<Label for="fuzzy-threshold">
				Fuzzy Match Threshold: {settings.value['voiceCommands.fuzzyThreshold']}
			</Label>
			<p class="text-muted-foreground text-sm">
				How closely a spoken phrase must match a command (0.5 = loose, 1.0 =
				exact match only).
			</p>
			<input
				id="fuzzy-threshold"
				type="range"
				min="0.5"
				max="1.0"
				step="0.05"
				value={Number.parseFloat(
					settings.value['voiceCommands.fuzzyThreshold'],
				)}
				oninput={(e) =>
					settings.updateKey(
						'voiceCommands.fuzzyThreshold',
						Number.parseFloat(e.currentTarget.value).toFixed(2),
					)}
				class="max-w-xs w-full"
			/>
		</div>

		<div class="flex items-center justify-between rounded-lg border p-4">
			<div class="space-y-0.5">
				<Label>Feedback Sound</Label>
				<p class="text-muted-foreground text-sm">
					Play a sound when a voice command is executed.
				</p>
			</div>
			<Switch
				checked={settings.value['voiceCommands.feedbackSound']}
				onCheckedChange={(checked) =>
					settings.updateKey('voiceCommands.feedbackSound', checked)}
			/>
		</div>

		<div class="flex items-center justify-between rounded-lg border p-4">
			<div class="space-y-0.5">
				<Label>Show Notification</Label>
				<p class="text-muted-foreground text-sm">
					Show a toast notification when a voice command is matched and
					executed.
				</p>
			</div>
			<Switch
				checked={settings.value['voiceCommands.showNotification']}
				onCheckedChange={(checked) =>
					settings.updateKey('voiceCommands.showNotification', checked)}
			/>
		</div>
	</div>
</div>
