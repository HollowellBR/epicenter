import { extractErrorMessage } from 'wellcrafted/error';
import { Err, Ok, type Result, tryAsync } from 'wellcrafted/result';

interface OllamaCompleteParams {
	baseUrl: string;
	model: string;
	systemPrompt: string;
	userPrompt: string;
}

interface OllamaGenerateResponse {
	response: string;
}

interface OllamaTagsResponse {
	models: { name: string; size: number; modified_at: string }[];
}

export const OllamaCompletionServiceLive = {
	async complete({
		baseUrl,
		model,
		systemPrompt,
		userPrompt,
	}: OllamaCompleteParams): Promise<Result<string, string>> {
		if (!model) {
			return Err(
				'No Ollama model configured. Go to Settings > Ollama to select a model.',
			);
		}

		const url = `${baseUrl.replace(/\/+$/, '')}/api/generate`;

		return tryAsync({
			try: async () => {
				const response = await fetch(url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model,
						system: systemPrompt,
						prompt: userPrompt,
						stream: false,
					}),
				});

				if (!response.ok) {
					const body = await response.text().catch(() => '');
					if (response.status === 404 && body.includes('not found')) {
						throw new Error(
							`Model "${model}" not found in Ollama. Run: ollama pull ${model}`,
						);
					}
					throw new Error(
						`Ollama returned ${response.status}: ${body || response.statusText}`,
					);
				}

				const data = (await response.json()) as OllamaGenerateResponse;
				return data.response;
			},
			catch: (error) => {
				const msg = extractErrorMessage(error);
				if (msg.includes('fetch') || msg.includes('ECONNREFUSED')) {
					return Err(
						`Cannot connect to Ollama at ${baseUrl}. Is Ollama running?`,
					);
				}
				return Err(msg);
			},
		});
	},

	async listModels(
		baseUrl: string,
	): Promise<Result<{ name: string; size: number }[], string>> {
		const url = `${baseUrl.replace(/\/+$/, '')}/api/tags`;

		return tryAsync({
			try: async () => {
				const response = await fetch(url);
				if (!response.ok) {
					throw new Error(
						`Ollama returned ${response.status}: ${response.statusText}`,
					);
				}
				const data = (await response.json()) as OllamaTagsResponse;
				return data.models.map((m) => ({ name: m.name, size: m.size }));
			},
			catch: (error) => {
				const msg = extractErrorMessage(error);
				if (msg.includes('fetch') || msg.includes('ECONNREFUSED')) {
					return Err(
						`Cannot connect to Ollama at ${baseUrl}. Is Ollama running?`,
					);
				}
				return Err(msg);
			},
		});
	},
};

export type OllamaCompletionService = typeof OllamaCompletionServiceLive;
