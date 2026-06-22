/**
 * Cloud completion provider presets.
 *
 * The cloud completion backend speaks the OpenAI-compatible
 * `/chat/completions` shape, so every preset here is just a base URL plus
 * which `apiKeys.*` setting holds its key. Anthropic exposes an
 * OpenAI-compatible endpoint, so it fits the same adapter as OpenAI/Groq/etc.
 *
 * Default is Anthropic + Claude Haiku 4.5: fast and cheap for text cleanup,
 * and the strongest data-handling posture (no training on API data; ZDR
 * available) for the confidential text a transform may send off-device.
 */

export const CLOUD_PRESETS = [
	{
		id: 'Anthropic',
		label: 'Anthropic (Claude)',
		baseUrl: 'https://api.anthropic.com/v1',
		apiKeyField: 'apiKeys.anthropic',
		defaultModel: 'claude-haiku-4-5',
	},
	{
		id: 'OpenAI',
		label: 'OpenAI',
		baseUrl: 'https://api.openai.com/v1',
		apiKeyField: 'apiKeys.openai',
		defaultModel: 'gpt-4o-mini',
	},
	{
		id: 'Groq',
		label: 'Groq',
		baseUrl: 'https://api.groq.com/openai/v1',
		apiKeyField: 'apiKeys.groq',
		defaultModel: 'llama-3.3-70b-versatile',
	},
	{
		id: 'OpenRouter',
		label: 'OpenRouter',
		baseUrl: 'https://openrouter.ai/api/v1',
		apiKeyField: 'apiKeys.openrouter',
		defaultModel: 'anthropic/claude-3.5-haiku',
	},
	{
		id: 'Custom',
		label: 'Custom (OpenAI-compatible)',
		baseUrl: '',
		apiKeyField: 'apiKeys.custom',
		defaultModel: '',
	},
] as const;

/** Union of valid cloud preset IDs (also the stored `cloud.provider` value). */
export type CloudPresetId = (typeof CLOUD_PRESETS)[number]['id'];

/** A single cloud preset object. */
export type CloudPreset = (typeof CLOUD_PRESETS)[number];

/** Explicit tuple of preset IDs for the settings enum (keeps literal types). */
export const CLOUD_PRESET_IDS = [
	'Anthropic',
	'OpenAI',
	'Groq',
	'OpenRouter',
	'Custom',
] as const satisfies readonly CloudPresetId[];

/** Dropdown options derived from the preset array. */
export const CLOUD_PRESET_OPTIONS = CLOUD_PRESETS.map((p) => ({
	value: p.id,
	label: p.label,
}));
