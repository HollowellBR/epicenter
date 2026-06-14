import { Ok } from 'wellcrafted/result';
import { STENO_RECORDINGS_PATHNAME } from '$lib/constants/app';
import { defineMutation } from '$lib/query/client';
import type { StenoError } from '$lib/result';
import type { TextServiceError } from '$lib/services/isomorphic/text';
import { settings } from '$lib/state/settings.svelte';
import { notify } from './notify';
import { text } from './text';

export const delivery = {
	/**
	 * Delivers transcript to the user according to their text output preferences.
	 *
	 * This mutation handles the complete delivery workflow for transcription results:
	 * 1. Shows a success toast with the transcript
	 * 2. Optionally copies text to clipboard based on user settings
	 * 3. Optionally writes text to cursor based on user settings
	 * 4. Provides fallback UI actions when automatic operations fail
	 *
	 * The user's preferences are read from:
	 * - `transcription.copyToClipboardOnSuccess` - Whether to auto-copy
	 * - `transcription.writeToCursorOnSuccess` - Whether to auto-write to cursor
	 *
	 * @param text - The transcript to deliver
	 * @param toastId - Unique ID for toast notifications to prevent duplicates
	 * @returns Result with no meaningful data (fire-and-forget operation)
	 *
	 * @example
	 * ```typescript
	 * // After transcription completes
	 * await rpc.delivery.deliverTranscriptionResult({
	 *   text: transcript,
	 *   toastId: nanoid()
	 * });
	 * ```
	 */
	deliverTranscriptionResult: defineMutation({
		mutationKey: ['delivery', 'deliverTranscriptionResult'],
		mutationFn: async ({
			text: transcript,
			toastId,
		}: {
			text: string;
			toastId: string;
		}) => {
			// Track what operations succeeded
			let copied = false;
			let written = false;

			// Shows transcription result and offers manual copy action
			const offerManualCopy = () =>
				notify.success({
					id: toastId,
					title: '📝 Recording transcribed!',
					description: transcript,
					action: {
						type: 'button',
						label: 'Copy to clipboard',
						onClick: async () => {
							const { error } = await text.copyToClipboard({
								text: transcript,
							});
							if (error) {
								// Report that manual copy attempt failed
								notify.error({
									title: 'Error copying transcript to clipboard',
									description: error.message,
									action: { type: 'more-details', error },
								});
								return;
							}
							// Confirm manual copy succeeded
							notify.success({
								id: toastId,
								title: 'Copied transcript to clipboard!',
								description: transcript,
							});
						},
					},
				});

			// Warns that automatic copy failed
			const warnAutoCopyFailed = (error: TextServiceError) => {
				notify.warning({
					title: "Couldn't copy to clipboard",
					description: error.message,
					action: { type: 'more-details', error },
				});
			};

			// Warns that write to cursor failed
			const warnWriteToCursorFailed = (
				error: TextServiceError | StenoError,
			) => {
				if (error.name === 'TextServiceError') {
					notify.warning({
						title: 'Unable to write to cursor automatically',
						description: error.message,
						action: { type: 'more-details', error },
					});
					return;
				}
				if (error.name === 'StenoError') {
					notify[error.severity](error);
					return;
				}
			};

			// Show appropriate success notification based on what succeeded
			const showSuccessNotification = () => {
				if (copied && written) {
					// Both operations succeeded
					notify.success({
						id: toastId,
						title:
							'📝 Recording transcribed, copied to clipboard, and written to cursor!',
						description: transcript,
						action: {
							type: 'link',
							label: 'Go to recordings',
							href: STENO_RECORDINGS_PATHNAME,
						},
					});
				} else if (copied) {
					// Only copy succeeded
					notify.success({
						id: toastId,
						title: '📝 Recording transcribed and copied to clipboard!',
						description: transcript,
						action: {
							type: 'link',
							label: 'Go to recordings',
							href: STENO_RECORDINGS_PATHNAME,
						},
					});
				} else if (written) {
					// Only write succeeded
					notify.success({
						id: toastId,
						title: '📝 Recording transcribed and written to cursor!',
						description: transcript,
						action: {
							type: 'link',
							label: 'Go to recordings',
							href: STENO_RECORDINGS_PATHNAME,
						},
					});
				} else {
					// Neither succeeded, offer manual copy
					offerManualCopy();
				}
			};

			// Main delivery flow - operations are independent

			// Check if user wants to copy to clipboard
			if (settings.value['transcription.copyToClipboardOnSuccess']) {
				const { error: copyError } = await text.copyToClipboard({
					text: transcript,
				});
				if (!copyError) {
					copied = true;
				} else {
					warnAutoCopyFailed(copyError);
				}
			}

			// Check if user wants to write to cursor (independent of copy)
			if (settings.value['transcription.writeToCursorOnSuccess']) {
				const { error: writeError } = await text.writeToCursor({
					text: transcript,
				});
				if (!writeError) {
					written = true;
					// Optionally simulate Enter keystroke after successful write
					if (settings.value['transcription.simulateEnterAfterOutput']) {
						const { error: enterError } =
							await text.simulateEnterKeystroke();
						if (enterError) {
							notify.warning({
								title: 'Unable to simulate Enter keystroke',
								description: enterError.message,
								action: { type: 'more-details', error: enterError },
							});
						}
					}
				} else {
					warnWriteToCursorFailed(writeError);
				}
			}

			// Show appropriate notification
			showSuccessNotification();

			return Ok(undefined);
		},
	}),

	/**
	 * Delivers transformed text to the user according to their text output preferences.
	 *
	 * This mutation handles the complete delivery workflow for transformation results:
	 * 1. Shows a success toast with the transformed text
	 * 2. Optionally copies text to clipboard based on user settings
	 * 3. Optionally writes text to cursor based on user settings
	 * 4. Provides fallback UI actions when automatic operations fail
	 *
	 * The user's preferences are read from:
	 * - `transformation.copyToClipboardOnSuccess` - Whether to auto-copy
	 * - `transformation.writeToCursorOnSuccess` - Whether to auto-write to cursor
	 *
	 * @param text - The transformed text to deliver
	 * @param toastId - Unique ID for toast notifications to prevent duplicates
	 * @returns Result with no meaningful data (fire-and-forget operation)
	 *
	 * @example
	 * ```typescript
	 * // After transformation completes
	 * await rpc.delivery.deliverTransformationResult({
	 *   text: transformedText,
	 *   toastId: nanoid()
	 * });
	 * ```
	 */
	deliverTransformationResult: defineMutation({
		mutationKey: ['delivery', 'deliverTransformationResult'],
		mutationFn: async ({
			text: transformedText,
			toastId,
		}: {
			text: string;
			toastId: string;
		}) => {
			// Track what operations succeeded
			let copied = false;
			let written = false;

			// Shows transformation result and offers manual copy action
			const offerManualCopy = () =>
				notify.success({
					id: toastId,
					title: '🔄 Transformation complete!',
					description: transformedText,
					action: {
						type: 'button',
						label: 'Copy to clipboard',
						onClick: async () => {
							const { error } = await text.copyToClipboard({
								text: transformedText,
							});
							if (error) {
								// Report that manual copy attempt failed
								notify.error({
									title: 'Error copying transformed text to clipboard',
									description: error.message,
									action: { type: 'more-details', error },
								});
								return;
							}
							// Confirm manual copy succeeded
							notify.success({
								id: toastId,
								title: 'Copied transformed text to clipboard!',
								description: transformedText,
							});
						},
					},
				});

			// Warns that automatic copy failed
			const warnAutoCopyFailed = (error: TextServiceError) => {
				notify.warning({
					title: "Couldn't copy to clipboard",
					description: error.message,
					action: { type: 'more-details', error },
				});
			};

			// Warns that write to cursor failed
			const warnWriteToCursorFailed = (
				error: TextServiceError | StenoError,
			) => {
				if (error.name === 'TextServiceError') {
					notify.error({
						title: 'Error writing transformed text to cursor',
						description: error.message,
						action: { type: 'more-details', error },
					});
					return;
				}
				if (error.name === 'StenoError') {
					notify[error.severity](error);
					return;
				}
			};

			// Show appropriate success notification based on what succeeded
			const showSuccessNotification = () => {
				if (copied && written) {
					// Both operations succeeded
					notify.success({
						id: toastId,
						title:
							'🔄 Transformation complete, copied to clipboard, and written to cursor!',
						description: transformedText,
						action: {
							type: 'link',
							label: 'Go to recordings',
							href: STENO_RECORDINGS_PATHNAME,
						},
					});
				} else if (copied) {
					// Only copy succeeded
					notify.success({
						id: toastId,
						title: '🔄 Transformation complete and copied to clipboard!',
						description: transformedText,
						action: {
							type: 'link',
							label: 'Go to recordings',
							href: STENO_RECORDINGS_PATHNAME,
						},
					});
				} else if (written) {
					// Only write succeeded
					notify.success({
						id: toastId,
						title: '🔄 Transformation complete and written to cursor!',
						description: transformedText,
						action: {
							type: 'link',
							label: 'Go to recordings',
							href: STENO_RECORDINGS_PATHNAME,
						},
					});
				} else {
					// Neither succeeded, offer manual copy
					offerManualCopy();
				}
			};

			// Main delivery flow - operations are independent

			// Check if user wants to copy to clipboard
			if (settings.value['transformation.copyToClipboardOnSuccess']) {
				const { error: copyError } = await text.copyToClipboard({
					text: transformedText,
				});
				if (!copyError) {
					copied = true;
				} else {
					warnAutoCopyFailed(copyError);
				}
			}

			// Check if user wants to write to cursor (independent of copy)
			if (settings.value['transformation.writeToCursorOnSuccess']) {
				const { error: writeError } = await text.writeToCursor({
					text: transformedText,
				});
				if (!writeError) {
					written = true;
					// Optionally simulate Enter keystroke after successful write
					if (settings.value['transformation.simulateEnterAfterOutput']) {
						const { error: enterError } =
							await text.simulateEnterKeystroke();
						if (enterError) {
							notify.warning({
								title: 'Unable to simulate Enter keystroke',
								description: enterError.message,
								action: { type: 'more-details', error: enterError },
							});
						}
					}
				} else {
					warnWriteToCursorFailed(writeError);
				}
			}

			// Show appropriate notification
			showSuccessNotification();

			return Ok(undefined);
		},
	}),
};
