<script lang="ts" module>
	import { cn, type WithElementRef } from '#/utils.js';
	import type {
		HTMLAnchorAttributes,
		HTMLButtonAttributes,
	} from 'svelte/elements';
	import { type VariantProps, tv } from 'tailwind-variants';

	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium outline-none transition-all focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
				destructive:
					'bg-destructive shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60 text-white',
				outline:
					'bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 border',
				secondary:
					'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
				ghost:
					'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
			},
			size: {
				default: 'h-9 px-4 py-2 has-[>svg]:px-3',
				sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
				lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
				icon: 'size-9',
				'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
				'icon-sm': 'size-8',
				'icon-lg': 'size-10',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

	// This component renders either a <button> or an <a> from one prop set, so
	// we intersect both attribute types. Event-handler props (onclick, etc.)
	// are typed against the concrete element and would collide across the
	// intersection, so we keep the button element's handlers and omit the
	// anchor's; at runtime the same handlers still fire when rendered as a link.
	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		Omit<WithElementRef<HTMLAnchorAttributes>, `on${string}`> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
			/**
			 * Shows a spinner and disables the button.
			 * Replaces children with a spinner when true and button has icon size,
			 * or prepends a spinner otherwise.
			 */
			loading?: boolean;
			/**
			 * Tooltip text to display on hover.
			 * Requires a parent `<Tooltip.Provider>` in the component tree.
			 * Wrap your app root with `<Tooltip.Provider>` to enable tooltip coordination.
			 */
			tooltip?: string;
		};
</script>

<script lang="ts">
	import * as Tooltip from '#/tooltip';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';

	let {
		class: className,
		variant = 'default',
		size = 'default',
		loading = false,
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		disabled,
		children,
		tooltip,
		...restProps
	}: ButtonProps = $props();

	const isIconSize = $derived(
		size === 'icon' || size === 'icon-xs' || size === 'icon-sm' || size === 'icon-lg',
	);
	const effectiveDisabled = $derived(disabled || loading);

	// Auto-derive aria-label from tooltip for icon buttons when no explicit label is provided
	const derivedAriaLabel = $derived(
		!restProps['aria-label'] && !restProps['aria-labelledby'] && tooltip
			? tooltip
			: undefined,
	);
</script>

{#snippet inner()}
	{#if loading}
		<Loader2Icon class="animate-spin" aria-hidden="true" />
	{/if}
	{#if !(loading && isIconSize)}
		{@render children?.()}
	{/if}
{/snippet}

{#snippet buttonContent(tooltipProps?: Record<string, unknown>)}
	{#if href}
		{@const anchorProps = restProps as Record<string, unknown>}
		<a
			bind:this={ref}
			data-slot="button"
			class={cn(buttonVariants({ variant, size }), className)}
			href={effectiveDisabled ? undefined : href}
			aria-disabled={effectiveDisabled}
			aria-busy={loading || undefined}
			aria-label={derivedAriaLabel}
			role={effectiveDisabled ? 'link' : undefined}
			tabindex={effectiveDisabled ? -1 : undefined}
			{...tooltipProps}
			{...anchorProps}
		>
			{@render inner()}
		</a>
	{:else}
		<button
			bind:this={ref}
			data-slot="button"
			class={cn(buttonVariants({ variant, size }), className)}
			aria-label={derivedAriaLabel}
			aria-busy={loading || undefined}
			{type}
			disabled={effectiveDisabled}
			{...tooltipProps}
			{...restProps}
		>
			{@render inner()}
		</button>
	{/if}
{/snippet}

<!--
	When using the tooltip prop, this component requires a parent Tooltip.Provider.
	Wrap your app root with <Tooltip.Provider> to enable tooltip coordination.
-->
{#if tooltip}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				{@render buttonContent(props)}
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content class="max-w-xs text-center">
			{tooltip}
		</Tooltip.Content>
	</Tooltip.Root>
{:else}
	{@render buttonContent()}
{/if}
