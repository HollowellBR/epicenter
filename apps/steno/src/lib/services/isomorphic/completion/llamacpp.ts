import { extractErrorMessage } from 'wellcrafted/error';
import { Err, type Result, tryAsync } from 'wellcrafted/result';

interface LlamaCppCompleteParams {
	/** Base URL of the local llama-server, e.g. http://127.0.0.1:8080/v1 */
	baseUrl: string;
	/** Model id — llama-server serves the loaded model; passed through for logs/compat. */
	model: string;
	systemPrompt: string;
	userPrompt: string;
}

interface OpenAiChatResponse {
	choices?: { message?: { content?: string } }[];
}

/**
 * Completion service backed by a bundled llama.cpp `llama-server` instance.
 *
 * llama-server exposes an OpenAI-compatible API, so this talks to
 * `POST {baseUrl}/chat/completions`. The Rust `start_llama_server` command is
 * responsible for spawning the server and waiting for `/health`; this client
 * assumes the server is already reachable.
 */
export const LlamaCppCompletionServiceLive = {
	async complete({
		baseUrl,
		model,
		systemPrompt,
		userPrompt,
	}: LlamaCppCompleteParams): Promise<Result<string, string>> {
		const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

		return tryAsync({
			try: async () => {
				const response = await fetch(url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model,
						messages: [
							{ role: 'system', content: systemPrompt },
							{ role: 'user', content: userPrompt },
						],
						stream: false,
					}),
				});

				if (!response.ok) {
					const body = await response.text().catch(() => '');
					throw new Error(
						`llama-server returned ${response.status}: ${body || response.statusText}`,
					);
				}

				const data = (await response.json()) as OpenAiChatResponse;
				return data.choices?.[0]?.message?.content ?? '';
			},
			catch: (error) => {
				const msg = extractErrorMessage(error);
				if (msg.includes('fetch') || msg.includes('ECONNREFUSED')) {
					return Err(
						`Cannot connect to the local llama-server at ${baseUrl}. Make sure a model is downloaded and selected.`,
					);
				}
				return Err(msg);
			},
		});
	},
};

export type LlamaCppCompletionService = typeof LlamaCppCompletionServiceLive;
