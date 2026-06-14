<script lang="ts">
	import { confirmationDialog } from '$lib/components/ConfirmationDialog.svelte';
	import { Button } from '@steno/ui/button';
	import { Input } from '@steno/ui/input';
	import { Label } from '@steno/ui/label';
	import { Textarea } from '@steno/ui/textarea';
	import * as Modal from '@steno/ui/modal';
	import * as Select from '@steno/ui/select';
	import { Separator } from '@steno/ui/separator';
	import { rpc } from '$lib/query';
	import { generateDefaultVoiceCommand } from '$lib/services/isomorphic/db/models/voice-commands';
	import { APP_ACTION_OPTIONS } from '$lib/services/isomorphic/voice-command-engine';
	import { createMutation, createQuery } from '@tanstack/svelte-query';
	import PlusIcon from '@lucide/svelte/icons/plus';

	const createCommand = createMutation(
		() => rpc.voiceCommands.commands.create.options,
	);

	const shellAllowlistQuery = createQuery(
		() => rpc.voiceCommands.shellAllowlist.getAll.options,
	);

	let isModalOpen = $state(false);
	let command = $state(generateDefaultVoiceCommand());
	let phrasesInput = $state('');
	const selectedAllowlistLabel = $derived.by(() => {
		const id = command.action.shell?.commandId;
		const entry = (shellAllowlistQuery.data ?? []).find((e) => e.id === id);
		return entry ? entry.title || entry.command : 'Select command...';
	});

	function promptUserConfirmLeave() {
		confirmationDialog.open({
			title: 'Unsaved changes',
			description: 'You have unsaved changes. Are you sure you want to leave?',
			confirm: { text: 'Leave' },
			onConfirm: () => {
				isModalOpen = false;
			},
		});
	}
</script>

<Modal.Root bind:open={isModalOpen}>
	<Modal.Trigger>
		{#snippet child({ props })}
			<Button {...props}>
				<PlusIcon class="size-4" />
				Create Command
			</Button>
		{/snippet}
	</Modal.Trigger>

	<Modal.Content
		class="max-h-[80vh] sm:max-w-2xl overflow-y-auto"
		onEscapeKeydown={(e) => {
			e.preventDefault();
			if (isModalOpen) promptUserConfirmLeave();
		}}
		onInteractOutside={(e) => {
			e.preventDefault();
			if (isModalOpen) promptUserConfirmLeave();
		}}
	>
		<Modal.Header>
			<Modal.Title>Create Voice Command</Modal.Title>
			<Separator />
		</Modal.Header>

		<div class="space-y-4 py-4">
			<div class="space-y-2">
				<Label for="title">Title</Label>
				<Input
					id="title"
					bind:value={command.title}
					placeholder="e.g., Save File"
				/>
			</div>

			<div class="space-y-2">
				<Label for="description">Description</Label>
				<Input
					id="description"
					bind:value={command.description}
					placeholder="Optional description"
				/>
			</div>

			<div class="space-y-2">
				<Label for="phrases">Trigger Phrases (comma-separated)</Label>
				<Textarea
					id="phrases"
					bind:value={phrasesInput}
					placeholder="save file, save, save document"
					rows={2}
				/>
				<p class="text-muted-foreground text-xs">
					Multiple phrases increase recognition chances.
				</p>
			</div>

			<div class="space-y-2">
				<Label>Action Type</Label>
				<Select.Root
					type="single"
					bind:value={
						() => command.action.type,
						(value) => {
							if (value) {
								command.action = {
									...command.action,
									type: value as 'keystroke' | 'app_action' | 'shell',
								};
							}
						}
					}
				>
					<Select.Trigger class="w-full">
						{command.action.type}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="keystroke" label="Keystroke" />
						<Select.Item value="app_action" label="App Action" />
						<Select.Item value="shell" label="Shell Command" />
					</Select.Content>
				</Select.Root>
			</div>

			{#if command.action.type === 'keystroke'}
				<div class="space-y-2">
					<Label for="keys">Key Combination</Label>
					<Input
						id="keys"
						value={command.action.keystroke?.keys ?? ''}
						oninput={(e) => {
							command.action = {
								...command.action,
								keystroke: {
									keys: e.currentTarget.value,
									delayMs: command.action.keystroke?.delayMs ?? 50,
								},
							};
						}}
						placeholder="e.g., Ctrl+S, Ctrl+Shift+F"
					/>
					<p class="text-muted-foreground text-xs">
						Modifiers: Ctrl, Shift, Alt, Meta/Win. Keys: a-z, F1-F12, Enter,
						Tab, Space, etc.
					</p>
				</div>
			{:else if command.action.type === 'app_action'}
				<div class="space-y-2">
					<Label for="action-name">App Action Name</Label>
					<Select.Root
						type="single"
						bind:value={
							() => command.action.appAction?.name ?? '',
							(value) => {
								if (value) {
									command.action = {
										...command.action,
										appAction: { name: value },
									};
								}
							}
						}
					>
						<Select.Trigger class="w-full">
							{command.action.appAction?.name || 'Select action...'}
						</Select.Trigger>
						<Select.Content>
							{#each APP_ACTION_OPTIONS as option}
								<Select.Item
									value={option.value}
									label={option.label}
								/>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{:else if command.action.type === 'shell'}
				<div class="space-y-2">
					<Label>Shell Command</Label>
					{#if (shellAllowlistQuery.data ?? []).length === 0}
						<p class="text-muted-foreground text-sm">
							No allowlisted commands yet. Add one in the
							<a href="/voice-commands/allowlist" class="underline">
								Shell Allowlist
							</a>
							first, then select it here.
						</p>
					{:else}
						<Select.Root
							type="single"
							bind:value={
								() => command.action.shell?.commandId ?? '',
								(value) => {
									if (value) {
										command.action = {
											...command.action,
											shell: { commandId: value },
										};
									}
								}
							}
						>
							<Select.Trigger class="w-full">
								{selectedAllowlistLabel}
							</Select.Trigger>
							<Select.Content>
								{#each shellAllowlistQuery.data ?? [] as entry}
									<Select.Item
										value={entry.id}
										label={entry.title || entry.command}
									/>
								{/each}
							</Select.Content>
						</Select.Root>
						<p class="text-muted-foreground text-xs">
							Manage entries in the
							<a href="/voice-commands/allowlist" class="underline">
								Shell Allowlist
							</a>.
						</p>
					{/if}
				</div>
			{/if}
		</div>

		<Modal.Footer>
			<Button variant="outline" onclick={() => (isModalOpen = false)}>
				Cancel
			</Button>
			<Button
				type="submit"
				onclick={() => {
					const phrases = phrasesInput
						.split(',')
						.map((p) => p.trim())
						.filter(Boolean);
					const commandToCreate = {
						...$state.snapshot(command),
						phrases,
					};
					createCommand.mutate(commandToCreate, {
						onSuccess: () => {
							isModalOpen = false;
							command = generateDefaultVoiceCommand();
							phrasesInput = '';
							rpc.notify.success({
								title: 'Created voice command!',
								description:
									'Your voice command has been created successfully.',
							});
						},
						onError: (error) => {
							rpc.notify.error({
								title: 'Failed to create voice command!',
								description: 'Your voice command could not be created.',
								action: { type: 'more-details', error },
							});
						},
					});
				}}
			>
				Create
			</Button>
		</Modal.Footer>
	</Modal.Content>
</Modal.Root>
