import { createTaggedError } from 'wellcrafted/error';
import { Ok } from 'wellcrafted/result';

export const { PermissionsServiceError, PermissionsServiceErr } =
	createTaggedError('PermissionsServiceError');
export type PermissionsServiceError = ReturnType<
	typeof PermissionsServiceError
>;

export const PermissionsServiceLive = {
	accessibility: {
		async check() {
			// Windows doesn't require accessibility permissions
			return Ok(true);
		},
		async request() {
			return Ok(true);
		},
	},
	microphone: {
		async check() {
			return Ok(true);
		},
		async request() {
			return Ok(true);
		},
	},
};

export type PermissionsService = typeof PermissionsServiceLive;
