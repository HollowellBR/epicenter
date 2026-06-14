<script lang="ts">
	import { confirmationDialog } from '$lib/components/ConfirmationDialog.svelte';
	import { Button } from '@steno/ui/button';
	import { TrashIcon } from '$lib/components/icons';
	import { Skeleton } from '@steno/ui/skeleton';
	import { rpc } from '$lib/query';
	import { createQuery } from '@tanstack/svelte-query';
	import EditVoiceCommandModal from './EditVoiceCommandModal.svelte';

	let { commandId }: { commandId: string } = $props();

	const commandQuery = createQuery(
		() => rpc.voiceCommands.commands.getById(() => commandId).options,
	);
	const command = $derived(commandQuery.data);
</script>

<div class="flex items-center gap-1">
	{#if !command}
		<Skeleton class="size-8" />
		<Skeleton class="size-8" />
	{:else}
		<EditVoiceCommandModal {command} />

		<Button
			tooltip="Delete voice command"
			onclick={() => {
				confirmationDialog.open({
					title: 'Delete voice command',
					description:
						'Are you sure you want to delete this voice command?',
					confirm: { text: 'Delete', variant: 'destructive' },
					onConfirm: async () => {
						const { error } =
							await rpc.voiceCommands.commands.delete(command);
						if (error) {
							rpc.notify.error({
								title: 'Failed to delete voice command!',
								description:
									'Your voice command could not be deleted.',
								action: { type: 'more-details', error },
							});
							throw error;
						}
						rpc.notify.success({
							title: 'Deleted voice command!',
							description:
								'Your voice command has been deleted successfully.',
						});
					},
				});
			}}
			variant="ghost"
			size="icon"
		>
			<TrashIcon class="size-4" />
		</Button>
	{/if}
</div>
