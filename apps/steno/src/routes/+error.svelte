<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '@steno/ui/button';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import FileQuestionIcon from '@lucide/svelte/icons/file-question';
</script>

<svelte:head>
	<title>
		{page.status === 404 ? 'Page Not Found' : `Error ${page.status}`} - Steno
	</title>
</svelte:head>

<main class="flex flex-1 flex-col items-center justify-center gap-6 p-8">
	<div class="flex flex-col items-center text-center space-y-6 max-w-md">
		{#if page.status === 404}
			<FileQuestionIcon class="size-16 text-muted-foreground" />
		{:else}
			<TriangleAlertIcon class="size-16 text-destructive" />
		{/if}

		<div class="space-y-2">
			<h1 class="text-4xl font-bold text-foreground">
				{page.status}
			</h1>
			<p class="text-muted-foreground text-lg">
				{#if page.status === 404}
					The page you're looking for doesn't exist.
				{:else if page.status === 500}
					Something went wrong on our end.
				{:else}
					An unexpected error occurred.
				{/if}
			</p>
		</div>

		{#if page.error}
			<details class="w-full text-left">
				<summary class="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
					Show error details
				</summary>
				<pre class="mt-2 text-sm text-destructive max-w-lg overflow-auto p-4 bg-muted rounded-lg break-words whitespace-pre-wrap">{page.error.message}</pre>
			</details>
		{/if}

		<div class="flex gap-3 pt-2">
			<Button variant="outline" onclick={() => history.back()}>
				Go Back
			</Button>
			<Button href="/">
				Go Home
			</Button>
		</div>
	</div>
</main>
