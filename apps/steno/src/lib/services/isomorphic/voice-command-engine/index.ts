export { APP_ACTION_OPTIONS, executeAppAction } from './app-actions';
export type { AppActionName } from './app-actions';
export { isCommandActiveInContext } from './context-matcher';
export { detectPrefix, matchCommand } from './engine';
export { levenshteinSimilarity } from './levenshtein';
export {
	createActionExecutor,
	VoiceCommandExecutorErr,
	VoiceCommandExecutorError,
} from './executor';
export type {
	ActionExecutor,
	VoiceCommandExecutorError as VoiceCommandExecutorErrorType,
} from './executor';
export {
	CommandFileSchema,
	commandFileToEntities,
	entitiesToCommandFileJson,
	getBuiltinDefaults,
	parseCommandFile,
} from './json-loader';
export type { CommandFile } from './json-loader';
export type { CommandMatchResult, PrefixDetectionResult } from './types';
