import { type } from 'arktype';
import { nanoid } from 'nanoid/non-secure';

export const ShellAllowlistEntry = type({
	id: 'string',
	title: 'string',
	command: 'string',
	args: 'string[]',
	description: 'string',
	createdAt: 'string',
	updatedAt: 'string',
});

export type ShellAllowlistEntry = typeof ShellAllowlistEntry.infer;

export function generateDefaultShellAllowlistEntry(): ShellAllowlistEntry {
	const now = new Date().toISOString();
	return {
		id: nanoid(),
		title: '',
		command: '',
		args: [],
		description: '',
		createdAt: now,
		updatedAt: now,
	};
}
