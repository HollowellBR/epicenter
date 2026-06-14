<script lang="ts">
	import { confirmationDialog } from '$lib/components/ConfirmationDialog.svelte';
	import { TrashIcon } from '$lib/components/icons';
	import { Badge } from '@steno/ui/badge';
	import { Button } from '@steno/ui/button';
	import * as ButtonGroup from '@steno/ui/button-group';
	import { Checkbox } from '@steno/ui/checkbox';
	import { Input } from '@steno/ui/input';
	import { Skeleton } from '@steno/ui/skeleton';
	import { SelectAllPopover, SortableTableHeader } from '@steno/ui/table';
	import * as Table from '@steno/ui/table';
	import { Switch } from '@steno/ui/switch';
	import { rpc } from '$lib/query';
	import type { VoiceCommand } from '$lib/services/isomorphic/db/models/voice-commands';
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
	import * as Alert from '@steno/ui/alert';
	import * as Empty from '@steno/ui/empty';
	import SearchIcon from '@lucide/svelte/icons/search';
	import MicIcon from '@lucide/svelte/icons/mic';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { createRawSnippet } from 'svelte';
	import { type } from 'arktype';
	import CreateVoiceCommandButton from './CreateVoiceCommandButton.svelte';
	import VoiceCommandRowActions from './VoiceCommandRowActions.svelte';
	import OpenFolderButton from '$lib/components/OpenFolderButton.svelte';
	import { PATHS } from '$lib/constants/paths';
	import ShieldIcon from '@lucide/svelte/icons/shield';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import {
		commandFileToEntities,
		entitiesToCommandFileJson,
		parseCommandFile,
	} from '$lib/services/isomorphic/voice-command-engine';
	import type { ShellAllowlistEntry } from '$lib/services/isomorphic/db/models/shell-allowlist';
	import { services } from '$lib/services';

	const shellAllowlistQuery = createQuery(
		() => rpc.voiceCommands.shellAllowlist.getAll.options,
	);

	const voiceCommandsQuery = createQuery(
		() => rpc.voiceCommands.commands.getAll.options,
	);

	const updateCommand = createMutation(
		() => rpc.voiceCommands.commands.update.options,
	);

	const columns: ColumnDef<VoiceCommand>[] = [
		{
			id: 'select',
			header: ({ table }) =>
				renderComponent(SelectAllPopover<VoiceCommand>, { table }),
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
			id: 'enabled',
			accessorKey: 'enabled',
			header: 'On',
			cell: ({ row }) =>
				renderComponent(Switch, {
					checked: row.original.enabled,
					onCheckedChange: (checked) => {
						updateCommand.mutate({
							...row.original,
							enabled: checked,
						});
					},
				}),
			enableSorting: false,
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
			accessorKey: 'phrases',
			header: 'Phrases',
			cell: ({ getValue }) => {
				const phrases = getValue<string[]>();
				const text = phrases.join(', ');
				return createRawSnippet(() => ({
					render: () =>
						`<span class="block max-w-64 truncate" title="${text.replace(/"/g, '&quot;')}">${text}</span>`,
				}));
			},
		},
		{
			id: 'actionType',
			accessorFn: (command) => command.action.type,
			header: 'Action',
			cell: ({ getValue }) =>
				renderComponent(Badge, {
					variant: 'outline',
					children: createRawSnippet(() => ({
						render: () => getValue<string>(),
					})),
				}),
		},
		{
			id: 'source',
			accessorKey: 'source',
			header: 'Source',
			cell: ({ getValue }) =>
				renderComponent(Badge, {
					variant: 'secondary',
					children: createRawSnippet(() => ({
						render: () => getValue<string>(),
					})),
				}),
		},
		{
			id: 'actions',
			accessorFn: (command) => command,
			header: 'Actions',
			cell: ({ getValue }) => {
				const command = getValue<VoiceCommand>();
				return renderComponent(VoiceCommandRowActions, {
					commandId: command.id,
				});
			},
		},
	];

	let sorting = createPersistedState({
		key: 'steno-voice-commands-data-table-sorting',
		onParseError: () => [{ id: 'title', desc: false }],
		schema: type({ desc: 'boolean', id: 'string' }).array(),
	});
	let columnFilters = $state<ColumnFiltersState>([]);
	let rowSelection = createPersistedState({
		key: 'steno-voice-commands-data-table-row-selection',
		onParseError: () => ({}),
		schema: type('Record<string, boolean>'),
	});
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 10 });
	let globalFilter = $state('');

	const table = createSvelteTable({
		getRowId: (originalRow) => originalRow.id,
		get data() {
			return voiceCommandsQuery.data ?? [];
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

	let isImporting = $state(false);
	let isExporting = $state(false);

	async function handleExport() {
		if (isExporting) return;
		isExporting = true;
		try {
			const commands = voiceCommandsQuery.data ?? [];
			const shellEntries = shellAllowlistQuery.data ?? [];
			const json = entitiesToCommandFileJson(commands, shellEntries);

			if (!window.__TAURI_INTERNALS__) {
				// Web fallback: download as blob
				const blob = new Blob([json], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = 'voice-commands.json';
				a.click();
				URL.revokeObjectURL(url);
				return;
			}

			const { save } = await import('@tauri-apps/plugin-dialog');
			const { writeTextFile } = await import('@tauri-apps/plugin-fs');

			const path = await save({
				filters: [{ name: 'JSON', extensions: ['json'] }],
				defaultPath: 'voice-commands.json',
			});
			if (!path) return;

			try {
				await writeTextFile(path, json);
				rpc.notify.success({
					title: 'Exported voice commands',
					description: `Saved ${commands.length} commands to file.`,
				});
			} catch (e) {
				rpc.notify.error({
					title: 'Export failed',
					description: e instanceof Error ? e.message : String(e),
				});
			}
		} finally {
			isExporting = false;
		}
	}

	async function handleImport() {
		if (isImporting) return;
		isImporting = true;
		try {
			let json: string;

			if (window.__TAURI_INTERNALS__) {
				const { open } = await import('@tauri-apps/plugin-dialog');
				const { readTextFile } = await import('@tauri-apps/plugin-fs');

				const path = await open({
					filters: [{ name: 'JSON', extensions: ['json'] }],
					multiple: false,
				});
				if (!path) return;

				try {
					json = await readTextFile(path as string);
				} catch (e) {
					rpc.notify.error({
						title: 'Import failed',
						description: `Could not read file: ${e instanceof Error ? e.message : String(e)}`,
					});
					return;
				}
			} else {
				// Web fallback: file input
				const input = document.createElement('input');
				input.type = 'file';
				input.accept = '.json';
				const file = await new Promise<File | null>((resolve) => {
					input.onchange = () => resolve(input.files?.[0] ?? null);
					input.click();
				});
				if (!file) return;
				json = await file.text();
			}

			const parsed = parseCommandFile(json);
			if (!parsed) {
				rpc.notify.error({
					title: 'Invalid file',
					description:
						'The selected file is not a valid voice commands JSON file.',
				});
				return;
			}

			const { commands: newCommands, shellEntries } =
				commandFileToEntities(parsed, 'json_file');

			let importedCount = 0;
			for (const command of newCommands) {
				const { error } = await rpc.voiceCommands.commands.create(command);
				if (!error) importedCount++;
			}
			for (const entry of shellEntries) {
				await rpc.voiceCommands.shellAllowlist.create(entry);
			}

			rpc.notify.success({
				title: 'Imported voice commands',
				description: `Added ${importedCount} commands${shellEntries.length > 0 ? ` and ${shellEntries.length} shell allowlist entries` : ''}.`,
			});
		} finally {
			isImporting = false;
		}
	}
</script>

<svelte:head>
	<title>Voice Commands</title>
</svelte:head>

<main class="flex w-full flex-1 flex-col gap-2 px-4 py-4 sm:px-8 mx-auto">
	<h1 class="scroll-m-20 text-4xl font-bold tracking-tight lg:text-5xl">
		Voice Commands
	</h1>
	<p class="text-muted-foreground">
		Commands triggered by speaking a prefix keyword followed by a phrase.
	</p>

	<div class="flex items-center justify-between gap-2 w-full">
		<Input
			placeholder="Filter commands..."
			type="text"
			class="w-full"
			bind:value={globalFilter}
		/>
		{#if selectedRows.length > 0}
			<Button
				tooltip="Delete selected commands"
				variant="outline"
				size="icon"
				onclick={() => {
					confirmationDialog.open({
						title: 'Delete voice commands',
						description:
							'Are you sure you want to delete these voice commands?',
						confirm: { text: 'Delete', variant: 'destructive' },
						onConfirm: async () => {
							const { error } =
								await rpc.voiceCommands.commands.delete(
									selectedRows.map(({ original }) => original),
								);
							if (error) {
								rpc.notify.error({
									title: 'Failed to delete voice commands!',
									description:
										'Your voice commands could not be deleted.',
									action: { type: 'more-details', error },
								});
								throw error;
							}
							rpc.notify.success({
								title: 'Deleted voice commands!',
								description:
									'Your voice commands have been deleted successfully.',
							});
						},
					});
				}}
			>
				<TrashIcon class="size-4" />
			</Button>
		{/if}

		<Button
			href="/voice-commands/allowlist"
			variant="outline"
			tooltip="Manage shell allowlist"
		>
			<ShieldIcon class="size-4" />
			Shell Allowlist
		</Button>

		<Button
			variant="outline"
			size="icon"
			tooltip="Import commands from JSON"
			loading={isImporting}
			onclick={handleImport}
		>
			<UploadIcon class="size-4" />
		</Button>

		<Button
			variant="outline"
			size="icon"
			tooltip="Export commands to JSON"
			loading={isExporting}
			onclick={handleExport}
		>
			<DownloadIcon class="size-4" />
		</Button>

		<OpenFolderButton
			getFolderPath={PATHS.DB.VOICE_COMMANDS}
			tooltipText="Open voice commands folder"
		/>

		<CreateVoiceCommandButton />
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
				{#if voiceCommandsQuery.isPending}
					{#each { length: 5 }}
						<Table.Row>
							<Table.Cell>
								<Skeleton class="size-4" />
							</Table.Cell>
							<Table.Cell colspan={columns.length - 1}>
								<Skeleton class="h-4 w-full" />
							</Table.Cell>
						</Table.Row>
					{/each}
				{:else if voiceCommandsQuery.isError}
					<Table.Row>
						<Table.Cell colspan={columns.length}>
							<Alert.Root variant="destructive" class="my-4">
								<TriangleAlertIcon />
								<Alert.Title>Failed to load voice commands</Alert.Title>
								<Alert.Description>
									{voiceCommandsQuery.error?.message ?? 'An unexpected error occurred.'}
									<Button
										variant="outline"
										size="sm"
										class="mt-2"
										onclick={() => voiceCommandsQuery.refetch()}
									>
										Retry
									</Button>
								</Alert.Description>
							</Alert.Root>
						</Table.Cell>
					</Table.Row>
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
											<MicIcon />
										{/if}
									</Empty.Media>
									<Empty.Title>
										{#if globalFilter}
											No commands found
										{:else}
											No voice commands yet
										{/if}
									</Empty.Title>
									<Empty.Description>
										{#if globalFilter}
											Try adjusting your search or filters.
										{:else}
											Click "Create Command" to add one.
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
