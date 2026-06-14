/**
 * Configuration for a local LLM that can be downloaded and served by the
 * bundled llama.cpp `llama-server`. Each model is a single GGUF file.
 */
export type LlmModelConfig = {
	/** Unique identifier for the model (stored in `llamacpp.model`). */
	id: string;
	/** Display name for the model. */
	name: string;
	/** Brief description of the model's capabilities. */
	description: string;
	/** Human-readable file size (e.g., "4.7 GB"). */
	size: string;
	/** Exact size in bytes for progress tracking / validation. */
	sizeBytes: number;
	/** Inference engine that serves this model. */
	engine: 'llamacpp';
	/** Filename to save the downloaded GGUF as. */
	filename: string;
	/** URL to download the GGUF from. */
	url: string;
};
