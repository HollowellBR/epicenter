<script lang="ts">
	import { PencilIcon as EditIcon } from '$lib/components/icons';
	import { Button } from '@steno/ui/button';

	let { onclick }: { onclick: () => void } = $props();
</script>

<Button tooltip="Edit entry" variant="ghost" size="icon" {onclick}>
	<EditIcon class="size-4" />
</Button>
