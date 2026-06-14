<script lang="ts">
	import { confirmationDialog } from '$lib/components/ConfirmationDialog.svelte';
	import { PencilIcon as EditIcon } from '$lib/components/icons';
	import { Button } from '@steno/ui/button';
	import { Input } from '@steno/ui/input';
	import { Label } from '@steno/ui/label';
	import { Textarea } from '@steno/ui/textarea';
	import * as Modal from '@steno/ui/modal';
	import * as Select from '@steno/ui/select';
	import { Separator } from '@steno/ui/separator';
	import { Spinner } from '@steno/ui/spinner';
	import { Switch } from '@steno/ui/switch';
	import { rpc } from '$lib/query';
	import type { VoiceCommand } from '$lib/services/isomorphic/db/models/voice-commands';
	import { APP_ACTION_OPTIONS } from '$lib/services/isomorphic/voice-command-engine';
	import { createMutation, createQuery } from '@tanstack/svelte-query';
	import TrashIcon from '@lucide/svelte/icons/trash';

	const updateCommand = createMutation(
		() => rpc.voiceCommands.commands.update.options,
	);

	const shellAllowlistQuery = createQuery(
		() => rpc.voiceCommands.shellAllowlist.getAll.options,
	);

	let {
		command,
	}: { command: VoiceCommand } = $props();

	let isDialogOpen = $state(false);
	let workingCopy = $derived(command);
	let phrasesInput = $derived(command.phrases.join(', '));
	const selectedAllowlistLabel = $derived.by(() => {
		const id = workingCopy.action.shell?.commandId;
		const entry = (shellAllowlistQuery.data ?? []).find((e) => e.id === id);
		return entry ? entry.title || entry.command : 'Select command...';
	});
	let isWorkingCopyDirty = $derived.by(() => {
		command;
		return false;
	});

	function promptUserConfirmLeave() {
		if (!isWorkingCopyDirty) {
			isDialogOpen = false;
			return;
		}
		confirmationDialog.open({
			title: 'Unsaved changes',
			description: 'You have unsaved changes. Are you sure you want to leave?',
			confirm: { text: 'Leave' },
			onConfirm: () => {
				workingCopy = command;
				isWorkingCopyDirty = false;
				isDialogOpen = false;
			},
		});
	}
</script>

<Modal.Root bind:open={isDialogOpen}>
	<Modal.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				tooltip="Edit voice command"
				variant="ghost"
				size="icon"
			>
				<EditIcon class="size-4" />
			</Button>
		{/snippet}
	</Modal.Trigger>

	<Modal.Content
		class="max-h-[80vh] sm:max-w-2xl overflow-y-auto"
		onEscapeKeydown={(e) => {
			e.preventDefault();
			if (isDialogOpen) promptUserConfirmLeave();
		}}
		onInteractOutside={(e) => {
			e.preventDefault();
			if (isDialogOpen) promptUserConfirmLeave();
		}}
	>
		<Modal.Header>
			<Modal.Title>Edit Voice Command</Modal.Title>
			<Separator />
		</Modal.Header>

		<div class="space-y-4 py-4">
			<div class="flex items-center justify-between">
				<Label>Enabled</Label>
				<Switch
					checked={workingCopy.enabled}
					onCheckedChange={(checked) => {
						workingCopy = { ...workingCopy, enabled: checked };
						isWorkingCopyDirty = true;
					}}
				/>
			</div>

			<div class="space-y-2">
				<Label for="edit-title">Title</Label>
				<Input
					id="edit-title"
					value={workingCopy.title}
					oninput={(e) => {
						workingCopy = { ...workingCopy, title: e.currentTarget.value };
						isWorkingCopyDirty = true;
					}}
					placeholder="e.g., Save File"
				/>
			</div>

			<div class="space-y-2">
				<Label for="edit-description">Description</Label>
				<Input
					id="edit-description"
					value={workingCopy.description}
					oninput={(e) => {
						workingCopy = {
							...workingCopy,
							description: e.currentTarget.value,
						};
						isWorkingCopyDirty = true;
					}}
					placeholder="Optional description"
				/>
			</div>

			<div class="space-y-2">
				<Label for="edit-phrases">Trigger Phrases (comma-separated)</Label>
				<Textarea
					id="edit-phrases"
					value={phrasesInput}
					oninput={(e) => {
						phrasesInput = e.currentTarget.value;
						isWorkingCopyDirty = true;
					}}
					placeholder="save file, save, save document"
					rows={2}
				/>
			</div>

			<div class="space-y-2">
				<Label>Action Type</Label>
				<Select.Root
					type="single"
					bind:value={
						() => workingCopy.action.type,
						(value) => {
							if (value) {
								workingCopy = {
									...workingCopy,
									action: {
										...workingCopy.action,
										type: value as 'keystroke' | 'app_action' | 'shell',
									},
								};
								isWorkingCopyDirty = true;
							}
						}
					}
				>
					<Select.Trigger class="w-full">
						{workingCopy.action.type}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="keystroke" label="Keystroke" />
						<Select.Item value="app_action" label="App Action" />
						<Select.Item value="shell" label="Shell Command" />
					</Select.Content>
				</Select.Root>
			</div>

			{#if workingCopy.action.type === 'keystroke'}
				<div class="space-y-2">
					<Label for="edit-keys">Key Combination</Label>
					<Input
						id="edit-keys"
						value={workingCopy.action.keystroke?.keys ?? ''}
						oninput={(e) => {
							workingCopy = {
								...workingCopy,
								action: {
									...workingCopy.action,
									keystroke: {
										keys: e.currentTarget.value,
										delayMs:
											workingCopy.action.keystroke?.delayMs ?? 50,
									},
								},
							};
							isWorkingCopyDirty = true;
						}}
						placeholder="e.g., Ctrl+S"
					/>
				</div>
			{:else if workingCopy.action.type === 'app_action'}
				<div class="space-y-2">
					<Label>App Action</Label>
					<Select.Root
						type="single"
						bind:value={
							() => workingCopy.action.appAction?.name ?? '',
							(value) => {
								if (value) {
									workingCopy = {
										...workingCopy,
										action: {
											...workingCopy.action,
											appAction: { name: value },
										},
									};
									isWorkingCopyDirty = true;
								}
							}
						}
					>
						<Select.Trigger class="w-full">
							{workingCopy.action.appAction?.name || 'Select action...'}
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
			{:else if workingCopy.action.type === 'shell'}
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
								() => workingCopy.action.shell?.commandId ?? '',
								(value) => {
									if (value) {
										workingCopy = {
											...workingCopy,
											action: {
												...workingCopy.action,
												shell: { commandId: value },
											},
										};
										isWorkingCopyDirty = true;
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

			<Separator />

			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<Label>Context-Aware Filtering</Label>
					<Switch
						checked={workingCopy.context.enabled}
						onCheckedChange={(checked) => {
							workingCopy = {
								...workingCopy,
								context: { ...workingCopy.context, enabled: checked },
							};
							isWorkingCopyDirty = true;
						}}
					/>
				</div>
				<p class="text-muted-foreground text-xs">
					Only match this command when the foreground window matches
					patterns.
				</p>
			</div>

			{#if workingCopy.context.enabled}
				<div class="space-y-2">
					<Label for="window-pattern">Window Title Pattern (regex)</Label>
					<Input
						id="window-pattern"
						value={workingCopy.context.windowTitlePattern ?? ''}
						oninput={(e) => {
							workingCopy = {
								...workingCopy,
								context: {
									...workingCopy.context,
									windowTitlePattern: e.currentTarget.value,
								},
							};
							isWorkingCopyDirty = true;
						}}
						placeholder="e.g., Visual Studio Code"
					/>
				</div>

				<div class="space-y-2">
					<Label for="process-pattern">Process Name Pattern (regex)</Label>
					<Input
						id="process-pattern"
						value={workingCopy.context.processNamePattern ?? ''}
						oninput={(e) => {
							workingCopy = {
								...workingCopy,
								context: {
									...workingCopy.context,
									processNamePattern: e.currentTarget.value,
								},
							};
							isWorkingCopyDirty = true;
						}}
						placeholder="e.g., code\\.exe"
					/>
				</div>
			{/if}
		</div>

		<Modal.Footer>
			<Button
				onclick={() => {
					confirmationDialog.open({
						title: 'Delete voice command',
						description: 'Are you sure? This action cannot be undone.',
						confirm: { text: 'Delete', variant: 'destructive' },
						onConfirm: async () => {
							const { error } = await rpc.voiceCommands.commands.delete(
								$state.snapshot(command),
							);
							if (error) {
								rpc.notify.error({
									title: 'Failed to delete voice command!',
									description:
										'Your voice command could not be deleted.',
									action: { type: 'more-details', error },
								});
								throw error;
							}
							isDialogOpen = false;
							rpc.notify.success({
								title: 'Deleted voice command!',
								description:
									'Your voice command has been deleted successfully.',
							});
						},
					});
				}}
				variant="destructive"
			>
				<TrashIcon class="size-4" />
				Delete
			</Button>
			<div class="flex items-center gap-2">
				<Button variant="outline" onclick={() => promptUserConfirmLeave()}>
					Close
				</Button>
				<Button
					onclick={() => {
						const phrases = phrasesInput
							.split(',')
							.map((p) => p.trim())
							.filter(Boolean);
						const commandToUpdate = {
							...$state.snapshot(workingCopy),
							phrases,
						};
						updateCommand.mutate(commandToUpdate, {
							onSuccess: () => {
								rpc.notify.success({
									title: 'Updated voice command!',
									description:
										'Your voice command has been updated successfully.',
								});
								isDialogOpen = false;
							},
							onError: (error) => {
								rpc.notify.error({
									title: 'Failed to update voice command!',
									description:
										'Your voice command could not be updated.',
									action: { type: 'more-details', error },
								});
							},
						});
					}}
					disabled={updateCommand.isPending || !isWorkingCopyDirty}
				>
					{#if updateCommand.isPending}
						<Spinner />
					{/if}
					Save
				</Button>
			</div>
		</Modal.Footer>
	</Modal.Content>
</Modal.Root>
