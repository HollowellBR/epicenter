import type { OsType } from '@tauri-apps/plugin-os';
import type { Result } from 'wellcrafted/result';
import { createTaggedError } from 'wellcrafted/error';

export const { OsServiceError, OsServiceErr } =
	createTaggedError('OsServiceError');
export type OsServiceError = ReturnType<typeof OsServiceError>;

export type ForegroundWindowInfo = {
	windowTitle: string;
	processName: string;
	processId: number;
};

export type OsService = {
	type: () => OsType;
	getForegroundWindow: () => Promise<
		Result<ForegroundWindowInfo, OsServiceError>
	>;
};
