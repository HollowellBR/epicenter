import type { TaggedError } from 'wellcrafted/error';
import { Err, type Ok } from 'wellcrafted/result';
import type { UnifiedNotificationOptions } from '$lib/services/isomorphic/notifications/types';

/**
 * Custom error type for the Steno application that combines error information
 * with notification display options. This error type is designed to be user-facing,
 * providing both error details and UI presentation information.
 */
export type StenoError = Omit<
	TaggedError<'StenoError'>,
	'message' | 'cause' | 'context'
> &
	Omit<UnifiedNotificationOptions, 'variant'> & {
		severity: 'error' | 'warning';
	};

/**
 * Input type for creating StenoError.
 * Allows either explicit description or serviceError (which auto-extracts .message).
 */
type StenoErrorInput = Omit<
	StenoError,
	'name' | 'severity' | 'description'
> & {
	/** Explicit description text */
	description?: string;
	/** Service-layer error to adapt. If provided, error.message becomes description */
	serviceError?: TaggedError<string>;
};

/**
 * Normalizes input to StenoError by handling serviceError.
 * - If serviceError provided and no description, uses serviceError.message
 * - If action is missing and serviceError provided, adds more-details action
 */
function normalizeInput(
	args: StenoErrorInput,
): Omit<StenoError, 'name' | 'severity'> {
	const { serviceError, ...rest } = args;

	// Derive description from serviceError if not explicitly provided
	const description = rest.description ?? serviceError?.message ?? '';

	// Auto-add more-details action if serviceError provided and no action specified
	const action =
		rest.action ??
		(serviceError
			? { type: 'more-details' as const, error: serviceError }
			: undefined);

	return { ...rest, description, action };
}

/**
 * Creates a StenoError with 'error' severity.
 * This is the primary factory function for creating error objects in the application.
 *
 * @example
 * ```typescript
 * // With explicit description
 * StenoErr({ title: 'Error', description: 'Something went wrong' });
 *
 * // With serviceError (auto-extracts message and adds more-details action)
 * StenoErr({ title: 'Error', serviceError: taggedError });
 * ```
 */
const StenoError = (args: StenoErrorInput): StenoError => ({
	name: 'StenoError',
	severity: 'error',
	...normalizeInput(args),
});

/**
 * Creates a Err wrapping a StenoError.
 */
export const StenoErr = (args: StenoErrorInput) =>
	Err(StenoError(args));

/**
 * Creates a StenoError with 'warning' severity.
 */
const StenoWarning = (args: StenoErrorInput): StenoError => ({
	name: 'StenoError',
	severity: 'warning',
	...normalizeInput(args),
});

/**
 * Creates a Err wrapping a StenoError with 'warning' severity.
 */
export const StenoWarningErr = (args: StenoErrorInput) =>
	Err(StenoWarning(args));

/**
 * Result type for Steno operations that can fail.
 * Follows the Result pattern where operations return either Ok<T> or Err<StenoError>.
 *
 * @template T - The type of the success value
 */
export type StenoResult<T> = Ok<T> | Err<StenoError>;

/**
 * Utility type for values that may or may not be wrapped in a Promise.
 * Useful for functions that can be either synchronous or asynchronous.
 *
 * @template T - The type that may or may not be wrapped in a Promise
 */
export type MaybePromise<T> = T | Promise<T>;
