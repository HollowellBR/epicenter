import type { Accessor } from '@tanstack/svelte-query';
import { Err, Ok } from 'wellcrafted/result';
import { defineMutation, defineQuery, queryClient } from '$lib/query/client';
import { services } from '$lib/services';
import type { VoiceCommand } from '$lib/services/isomorphic/db/models/voice-commands';
import type { ShellAllowlistEntry } from '$lib/services/isomorphic/db/models/shell-allowlist';

export const voiceCommandKeys = {
	voiceCommands: {
		all: ['db', 'voiceCommands'] as const,
		byId: (id: string) => ['db', 'voiceCommands', id] as const,
	},
	shellAllowlist: {
		all: ['db', 'shellAllowlist'] as const,
		byId: (id: string) => ['db', 'shellAllowlist', id] as const,
	},
};

export const voiceCommands = {
	commands: {
		getAll: defineQuery({
			queryKey: voiceCommandKeys.voiceCommands.all,
			queryFn: () => services.db.voiceCommands.getAll(),
		}),

		getById: (id: Accessor<string>) =>
			defineQuery({
				queryKey: voiceCommandKeys.voiceCommands.byId(id()),
				queryFn: () => services.db.voiceCommands.getById(id()),
				initialData: () =>
					queryClient
						.getQueryData<VoiceCommand[]>(
							voiceCommandKeys.voiceCommands.all,
						)
						?.find((c) => c.id === id()) ?? null,
				initialDataUpdatedAt: () =>
					queryClient.getQueryState(voiceCommandKeys.voiceCommands.all)
						?.dataUpdatedAt,
			}),

		create: defineMutation({
			mutationKey: ['db', 'voiceCommands', 'create'] as const,
			mutationFn: async (command: VoiceCommand) => {
				const { error } = await services.db.voiceCommands.create(command);
				if (error) return Err(error);

				queryClient.setQueryData<VoiceCommand[]>(
					voiceCommandKeys.voiceCommands.all,
					(oldData) => {
						if (!oldData) return [command];
						return [...oldData, command];
					},
				);
				queryClient.setQueryData<VoiceCommand>(
					voiceCommandKeys.voiceCommands.byId(command.id),
					command,
				);

				return Ok(undefined);
			},
		}),

		update: defineMutation({
			mutationKey: ['db', 'voiceCommands', 'update'] as const,
			mutationFn: async (command: VoiceCommand) => {
				const { data, error } =
					await services.db.voiceCommands.update(command);
				if (error) return Err(error);

				queryClient.setQueryData<VoiceCommand[]>(
					voiceCommandKeys.voiceCommands.all,
					(oldData) => {
						if (!oldData) return [command];
						return oldData.map((item) =>
							item.id === command.id ? command : item,
						);
					},
				);
				queryClient.setQueryData<VoiceCommand>(
					voiceCommandKeys.voiceCommands.byId(command.id),
					command,
				);

				return Ok(data);
			},
		}),

		delete: defineMutation({
			mutationKey: ['db', 'voiceCommands', 'delete'] as const,
			mutationFn: async (commands: VoiceCommand | VoiceCommand[]) => {
				const commandsArray = Array.isArray(commands)
					? commands
					: [commands];
				const { error } =
					await services.db.voiceCommands.delete(commandsArray);
				if (error) return Err(error);

				queryClient.setQueryData<VoiceCommand[]>(
					voiceCommandKeys.voiceCommands.all,
					(oldData) => {
						if (!oldData) return [];
						const deletedIds = new Set(commandsArray.map((c) => c.id));
						return oldData.filter((item) => !deletedIds.has(item.id));
					},
				);
				for (const command of commandsArray) {
					queryClient.removeQueries({
						queryKey: voiceCommandKeys.voiceCommands.byId(command.id),
					});
				}

				return Ok(undefined);
			},
		}),
	},

	shellAllowlist: {
		getAll: defineQuery({
			queryKey: voiceCommandKeys.shellAllowlist.all,
			queryFn: () => services.db.shellAllowlist.getAll(),
		}),

		getById: (id: Accessor<string>) =>
			defineQuery({
				queryKey: voiceCommandKeys.shellAllowlist.byId(id()),
				queryFn: () => services.db.shellAllowlist.getById(id()),
				initialData: () =>
					queryClient
						.getQueryData<ShellAllowlistEntry[]>(
							voiceCommandKeys.shellAllowlist.all,
						)
						?.find((e) => e.id === id()) ?? null,
				initialDataUpdatedAt: () =>
					queryClient.getQueryState(voiceCommandKeys.shellAllowlist.all)
						?.dataUpdatedAt,
			}),

		create: defineMutation({
			mutationKey: ['db', 'shellAllowlist', 'create'] as const,
			mutationFn: async (entry: ShellAllowlistEntry) => {
				const { error } = await services.db.shellAllowlist.create(entry);
				if (error) return Err(error);

				queryClient.setQueryData<ShellAllowlistEntry[]>(
					voiceCommandKeys.shellAllowlist.all,
					(oldData) => {
						if (!oldData) return [entry];
						return [...oldData, entry];
					},
				);

				return Ok(undefined);
			},
		}),

		update: defineMutation({
			mutationKey: ['db', 'shellAllowlist', 'update'] as const,
			mutationFn: async (entry: ShellAllowlistEntry) => {
				const { data, error } =
					await services.db.shellAllowlist.update(entry);
				if (error) return Err(error);

				queryClient.setQueryData<ShellAllowlistEntry[]>(
					voiceCommandKeys.shellAllowlist.all,
					(oldData) => {
						if (!oldData) return [entry];
						return oldData.map((item) =>
							item.id === entry.id ? entry : item,
						);
					},
				);

				return Ok(data);
			},
		}),

		delete: defineMutation({
			mutationKey: ['db', 'shellAllowlist', 'delete'] as const,
			mutationFn: async (
				entries: ShellAllowlistEntry | ShellAllowlistEntry[],
			) => {
				const entriesArray = Array.isArray(entries)
					? entries
					: [entries];
				const { error } =
					await services.db.shellAllowlist.delete(entriesArray);
				if (error) return Err(error);

				queryClient.setQueryData<ShellAllowlistEntry[]>(
					voiceCommandKeys.shellAllowlist.all,
					(oldData) => {
						if (!oldData) return [];
						const deletedIds = new Set(entriesArray.map((e) => e.id));
						return oldData.filter((item) => !deletedIds.has(item.id));
					},
				);

				return Ok(undefined);
			},
		}),
	},
};
