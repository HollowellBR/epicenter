import type { LlmModelConfig } from './types';

/**
 * Pre-built Qwen3 GGUF models served locally by llama.cpp `llama-server`.
 * Downloaded on demand from the official Qwen Hugging Face GGUF repos.
 */
export const LLM_MODELS = [
	{
		id: 'qwen3-8b',
		name: 'Qwen3 8B (Q4_K_M)',
		description:
			'Best local instruction-following for complex transforms — recommended default',
		size: '~4.7 GB',
		sizeBytes: 5_027_783_488,
		engine: 'llamacpp',
		filename: 'Qwen3-8B-Q4_K_M.gguf',
		url: 'https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf',
	},
	{
		id: 'qwen3-4b',
		name: 'Qwen3 4B (Q4_K_M)',
		description:
			'Faster and lighter — good for grammar/punctuation and light edits on modest hardware',
		size: '~2.3 GB',
		sizeBytes: 2_497_280_256,
		engine: 'llamacpp',
		filename: 'Qwen3-4B-Q4_K_M.gguf',
		url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf',
	},
] as const satisfies readonly LlmModelConfig[];

/** Default model id, matching the `llamacpp.model` setting default. */
export const DEFAULT_LLM_MODEL_ID = 'qwen3-8b';
