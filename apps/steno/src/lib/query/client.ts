import { QueryClient } from '@tanstack/svelte-query';
import { createQueryFactories } from 'wellcrafted/query';
import { browser } from '$app/environment';

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			enabled: browser,
			staleTime: 30_000,
		},
	},
});

export const { defineQuery, defineMutation } =
	createQueryFactories(queryClient);
