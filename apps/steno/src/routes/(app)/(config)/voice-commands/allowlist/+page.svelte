<script lang="ts">
	import { confirmationDialog } from '$lib/components/ConfirmationDialog.svelte';
	import { TrashIcon } from '$lib/components/icons';
	import { Button } from '@steno/ui/button';
	import * as ButtonGroup from '@steno/ui/button-group';
	import { Checkbox } from '@steno/ui/checkbox';
	import { Input } from '@steno/ui/input';
	import { Label } from '@steno/ui/label';
	import { Skeleton } from '@steno/ui/skeleton';
	import { Separator } from '@steno/ui/separator';
	import { Spinner } from '@steno/ui/spinner';
	import { SelectAllPopover, SortableTableHeader } from '@steno/ui/table';
	import * as Table from '@steno/ui/table';
	import * as Modal from '@steno/ui/modal';
	import * as Empty from '@steno/ui/empty';
	import { rpc } from '$lib/query';
	import type { ShellAllowlistEntry } from '$lib/services/isomorphic/db/models/shell-allowlist';
	import { generateDefaultShellAllowlistEntry } from '$lib/services/isomorphic/db/models/shell-allowlist';
	import { createPersistedState } from '@steno/svelte-utils';
	import { createQuery, createMutation } from '@tanstack/svelte-query';
	import {
		FlexRender,
		createTable as createSvelteTable,
		renderComponent,
	} from '@tanstack/svelte-table';
	import type {
		ColumnDef,
		ColumnFiltersState,
		PaginationState,
	} from '@tanstack/table-core';
	import {
		getCoreRowModel,
		getFilteredRowModel,
		getPaginationRowModel,
		getSortedRowModel,
	} from '@tanstack/table-core';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { type } from 'arktype';
	import AllowlistRowActions from './AllowlistRowActions.svelte';

	const allowlistQuery = createQuery(
		() => rpc.voiceCommands.shellAllowlist.getAll.options,
	);

	const updateEntry = createMutation(
		() => rpc.voiceCommands.shellAllowlist.update.options,
	);

	const createEntry = createMutation(
		() => rpc.voiceCommands.shellAllowlist.create.options,
	);

	// Create modal state
	let isCreateModalOpen = $state(false);
	let newEntry = $state(generateDefaultShellAllowlistEntry());
	let argsInput = $state('');

	// Edit modal state
	let isEditModalOpen = $state(false);
	let editEntry = $state<ShellAllowlistEntry | null>(null);
	let editArgsInput = $state('');

	const columns: ColumnDef<ShellAllowlistEntry>[] = [
		{
			id: 'select',
			header: ({ table }) =>
				renderComponent(SelectAllPopover<ShellAllowlistEntry>, { table }),
			cell: ({ row }) =>
				renderComponent(Checkbox, {
					checked: row.getIsSelected(),
					onCheckedChange: (value) => row.toggleSelected(!!value),
					'aria-label': 'Select row',
				}),
			enableSorting: false,
			enableHiding: false,
		},
		{
			accessorKey: 'title',
			header: ({ column }) =>
				renderComponent(SortableTableHeader, {
					column,
					headerText: 'Title',
				}),
		},
		{
			accessorKey: 'command',
			header: 'Command',
		},
		{
			accessorKey: 'args',
			header: 'Arguments',
			cell: ({ getValue }) => {
				const args = getValue<string[]>();
				return args.length > 0 ? args.join(' ') : '—';
			},
		},
		{
			accessorKey: 'description',
			header: 'Description',
		},
		{
			id: 'actions',
			header: 'Actions',
			cell: ({ row }) => {
				const entry = row.original;
				return renderComponent(AllowlistRowActions, {
					onclick: () => {
						editEntry = { ...entry };
						editArgsInput = entry.args.join(' ');
						isEditModalOpen = true;
					},
				});
			},
		},
	];

	let sorting = createPersistedState({
		key: 'steno-shell-allowlist-data-table-sorting',
		onParseError: () => [{ id: 'title', desc: false }],
		schema: type({ desc: 'boolean', id: 'string' }).array(),
	});
	let columnFilters = $state<ColumnFiltersState>([]);
	let rowSelection = createPersistedState({
		key: 'steno-shell-allowlist-data-table-row-selection',
		onParseError: () => ({}),
		schema: type('Record<string, boolean>'),
	});
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 10 });
	let globalFilter = $state('');

	const table = createSvelteTable({
		getRowId: (originalRow) => originalRow.id,
		get data() {
			return allowlistQuery.data ?? [];
		},
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		onSortingChange: (updater) => {
			if (typeof updater === 'function') {
				sorting.value = updater(sorting.value);
			} else {
				sorting.value = updater;
			}
		},
		onColumnFiltersChange: (updater) => {
			if (typeof updater === 'function') {
				columnFilters = updater(columnFilters);
			} else {
				columnFilters = updater;
			}
		},
		onRowSelectionChange: (updater) => {
			if (typeof updater === 'function') {
				rowSelection.value = updater(rowSelection.value);
			} else {
				rowSelection.value = updater;
			}
		},
		onPaginationChange: (updater) => {
			if (typeof updater === 'function') {
				pagination = updater(pagination);
			} else {
				pagination = updater;
			}
		},
		onGlobalFilterChange: (updater) => {
			if (typeof updater === 'function') {
				globalFilter = updater(globalFilter);
			} else {
				globalFilter = updater;
			}
		},
		state: {
			get sorting() {
				return sorting.value;
			},
			get columnFilters() {
				return columnFilters;
			},
			get rowSelection() {
				return rowSelection.value;
			},
			get pagination() {
				return pagination;
			},
			get globalFilter() {
				return globalFilter;
			},
		},
	});

	const selectedRows = $derived(table.getFilteredSelectedRowModel().rows);
</script>

<svelte:head>
	<title>Shell Allowlist</title>
</svelte:head>

<main class="flex w-full flex-1 flex-col gap-2 px-4 py-4 sm:px-8 mx-auto">
	<div class="flex items-center gap-2">
		<Button href="/voice-commands" variant="ghost" size="icon" tooltip="Back to voice commands">
			<ArrowLeftIcon class="size-4" />
		</Button>
		<div>
			<h1 class="scroll-m-20 text-4xl font-bold tracking-tight lg:text-5xl">
				Shell Allowlist
			</h1>
			<p class="text-muted-foreground">
				Pre-approved shell commands that can be executed by voice commands.
			</p>
		</div>
	</div>

	<div class="flex items-center justify-between gap-2 w-full">
		<Input
			placeholder="Filter entries..."
			type="text"
			class="w-full"
			bind:value={globalFilter}
		/>
		{#if selectedRows.length > 0}
			<Button
				tooltip="Delete selected entries"
				variant="outline"
				size="icon"
				onclick={() => {
					confirmationDialog.open({
						title: 'Delete allowlist entries',
						description:
							'Are you sure you want to delete these entries?',
						confirm: { text: 'Delete', variant: 'destructive' },
						onConfirm: async () => {
							const { error } =
								await rpc.voiceCommands.shellAllowlist.delete(
									selectedRows.map(({ original }) => original),
								);
							if (error) {
								rpc.notify.error({
									title: 'Failed to delete entries!',
									description:
										'Your allowlist entries could not be deleted.',
									action: { type: 'more-details', error },
								});
								throw error;
							}
							rpc.notify.success({
								title: 'Deleted entries!',
								description:
									'Your allowlist entries have been deleted successfully.',
							});
						},
					});
				}}
			>
				<TrashIcon class="size-4" />
			</Button>
		{/if}

		<Modal.Root bind:open={isCreateModalOpen}>
			<Modal.Trigger>
				{#snippet child({ props })}
					<Button {...props}>
						<PlusIcon class="size-4" />
						Add Entry
					</Button>
				{/snippet}
			</Modal.Trigger>
			<Modal.Content class="sm:max-w-lg">
				<Modal.Header>
					<Modal.Title>Add Shell Allowlist Entry</Modal.Title>
					<Separator />
				</Modal.Header>
				<div class="space-y-4 py-4">
					<div class="space-y-2">
						<Label for="new-title">Title</Label>
						<Input
							id="new-title"
							bind:value={newEntry.title}
							placeholder="e.g., Open Notepad"
						/>
					</div>
					<div class="space-y-2">
						<Label for="new-command">Command</Label>
						<Input
							id="new-command"
							bind:value={newEntry.command}
							placeholder="e.g., notepad.exe"
						/>
					</div>
					<div class="space-y-2">
						<Label for="new-args">Arguments (space-separated)</Label>
						<Input
							id="new-args"
							bind:value={argsInput}
							placeholder="e.g., --flag value"
						/>
					</div>
					<div class="space-y-2">
						<Label for="new-description">Description</Label>
						<Input
							id="new-description"
							bind:value={newEntry.description}
							placeholder="Optional description"
						/>
					</div>
				</div>
				<Modal.Footer>
					<Button variant="outline" onclick={() => (isCreateModalOpen = false)}>
						Cancel
					</Button>
					<Button
						onclick={() => {
							const args = argsInput
								.split(' ')
								.map((a) => a.trim())
								.filter(Boolean);
							const entryToCreate = {
								...$state.snapshot(newEntry),
								args,
							};
							createEntry.mutate(entryToCreate, {
								onSuccess: () => {
									isCreateModalOpen = false;
									newEntry = generateDefaultShellAllowlistEntry();
									argsInput = '';
									rpc.notify.success({
										title: 'Created allowlist entry!',
										description: 'Your entry has been created.',
									});
								},
								onError: (error) => {
									rpc.notify.error({
										title: 'Failed to create entry!',
										description: 'Your entry could not be created.',
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
	</div>

	<div class="rounded-md border">
		<Table.Root>
			<Table.Header>
				{#each table.getHeaderGroups() as headerGroup}
					<Table.Row>
						{#each headerGroup.headers as header}
							<Table.Head colspan={header.colSpan}>
								{#if !header.isPlaceholder}
									<FlexRender
										content={header.column.columnDef.header}
										context={header.getContext()}
									/>
								{/if}
							</Table.Head>
						{/each}
					</Table.Row>
				{/each}
			</Table.Header>
			<Table.Body>
				{#if allowlistQuery.isPending}
					{#each { length: 3 }}
						<Table.Row>
							<Table.Cell>
								<Skeleton class="size-4" />
							</Table.Cell>
							<Table.Cell colspan={columns.length - 1}>
								<Skeleton class="h-4 w-full" />
							</Table.Cell>
						</Table.Row>
					{/each}
				{:else if table.getRowModel().rows?.length}
					{#each table.getRowModel().rows as row (row.id)}
						<Table.Row>
							{#each row.getVisibleCells() as cell}
								<Table.Cell>
									<FlexRender
										content={cell.column.columnDef.cell}
										context={cell.getContext()}
									/>
								</Table.Cell>
							{/each}
						</Table.Row>
					{/each}
				{:else}
					<Table.Row>
						<Table.Cell colspan={columns.length}>
							<Empty.Root class="py-8">
								<Empty.Header>
									<Empty.Media variant="icon">
										{#if globalFilter}
											<SearchIcon />
										{:else}
											<ShieldIcon />
										{/if}
									</Empty.Media>
									<Empty.Title>
										{#if globalFilter}
											No entries found
										{:else}
											No allowlist entries yet
										{/if}
									</Empty.Title>
									<Empty.Description>
										{#if globalFilter}
											Try adjusting your search.
										{:else}
											Click "Add Entry" to allow a shell command.
										{/if}
									</Empty.Description>
								</Empty.Header>
							</Empty.Root>
						</Table.Cell>
					</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
	</div>

	<div class="flex items-center justify-between">
		<div class="text-muted-foreground text-sm">
			{selectedRows.length} of {table.getFilteredRowModel().rows.length} row(s)
			selected.
		</div>
		<ButtonGroup.Root>
			<Button
				variant="outline"
				size="sm"
				onclick={() => table.previousPage()}
				disabled={!table.getCanPreviousPage()}
			>
				Previous
			</Button>
			<Button
				variant="outline"
				size="sm"
				onclick={() => table.nextPage()}
				disabled={!table.getCanNextPage()}
			>
				Next
			</Button>
		</ButtonGroup.Root>
	</div>
</main>

<!-- Edit Modal -->
<Modal.Root bind:open={isEditModalOpen}>
	<Modal.Content class="sm:max-w-lg">
		<Modal.Header>
			<Modal.Title>Edit Allowlist Entry</Modal.Title>
			<Separator />
		</Modal.Header>
		{#if editEntry}
			<div class="space-y-4 py-4">
				<div class="space-y-2">
					<Label for="edit-title">Title</Label>
					<Input
						id="edit-title"
						value={editEntry.title}
						oninput={(e) => {
							if (editEntry)
								editEntry = { ...editEntry, title: e.currentTarget.value };
						}}
						placeholder="e.g., Open Notepad"
					/>
				</div>
				<div class="space-y-2">
					<Label for="edit-command">Command</Label>
					<Input
						id="edit-command"
						value={editEntry.command}
						oninput={(e) => {
							if (editEntry)
								editEntry = { ...editEntry, command: e.currentTarget.value };
						}}
						placeholder="e.g., notepad.exe"
					/>
				</div>
				<div class="space-y-2">
					<Label for="edit-args">Arguments (space-separated)</Label>
					<Input
						id="edit-args"
						value={editArgsInput}
						oninput={(e) => {
							editArgsInput = e.currentTarget.value;
						}}
						placeholder="e.g., --flag value"
					/>
				</div>
				<div class="space-y-2">
					<Label for="edit-description">Description</Label>
					<Input
						id="edit-description"
						value={editEntry.description}
						oninput={(e) => {
							if (editEntry)
								editEntry = {
									...editEntry,
									description: e.currentTarget.value,
								};
						}}
						placeholder="Optional description"
					/>
				</div>
			</div>
			<Modal.Footer>
				<Button
					onclick={() => {
						if (!editEntry) return;
						confirmationDialog.open({
							title: 'Delete allowlist entry',
							description: 'Are you sure? This action cannot be undone.',
							confirm: { text: 'Delete', variant: 'destructive' },
							onConfirm: async () => {
								const { error } =
									await rpc.voiceCommands.shellAllowlist.delete(
										$state.snapshot(editEntry!),
									);
								if (error) {
									rpc.notify.error({
										title: 'Failed to delete entry!',
										description: 'Your entry could not be deleted.',
										action: { type: 'more-details', error },
									});
									throw error;
								}
								isEditModalOpen = false;
								rpc.notify.success({
									title: 'Deleted entry!',
									description: 'Your entry has been deleted.',
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
					<Button variant="outline" onclick={() => (isEditModalOpen = false)}>
						Close
					</Button>
					<Button
						onclick={() => {
							if (!editEntry) return;
							const args = editArgsInput
								.split(' ')
								.map((a) => a.trim())
								.filter(Boolean);
							const entryToUpdate = {
								...$state.snapshot(editEntry),
								args,
								updatedAt: new Date().toISOString(),
							};
							updateEntry.mutate(entryToUpdate, {
								onSuccess: () => {
									rpc.notify.success({
										title: 'Updated entry!',
										description: 'Your entry has been updated.',
									});
									isEditModalOpen = false;
								},
								onError: (error) => {
									rpc.notify.error({
										title: 'Failed to update entry!',
										description: 'Your entry could not be updated.',
										action: { type: 'more-details', error },
									});
								},
							});
						}}
						disabled={updateEntry.isPending}
					>
						{#if updateEntry.isPending}
							<Spinner />
						{/if}
						Save
					</Button>
				</div>
			</Modal.Footer>
		{/if}
	</Modal.Content>
</Modal.Root>
