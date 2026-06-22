import { Err, Ok, type Result } from 'wellcrafted/result';

interface CloudCompleteParams {
	/** Base URL of an OpenAI-compatible API, e.g. https://api.anthropic.com/v1 */
	baseUrl: string;
	/** Bearer API key for the provider. */
	apiKey: string;
	/** Model id, e.g. `claude-haiku-4-5`. */
	model: string;
	systemPrompt: string;
	userPrompt: string;
}

/**
 * Error from the cloud completion service.
 *
 * `offline` is true only when the request never reached the provider
 * (no connection / DNS failure / connection refused). The transformer uses it
 * to decide whether an opt-in fallback to the local model is appropriate —
 * auth and rate-limit failures (`offline: false`) should surface instead of
 * being silently masked by a local retry.
 */
export type CloudCompletionError = {
	message: string;
	offline: boolean;
};

interface OpenAiChatResponse {
	choices?: { message?: { content?: string } }[];
}

/**
 * Completion service backed by a cloud, OpenAI-compatible chat API.
 *
 * Talks the same `POST {baseUrl}/chat/completions` shape as the local
 * llama-server client, plus a Bearer `Authorization` header. Anthropic, OpenAI,
 * Groq, and OpenRouter all speak this shape (Anthropic via its
 * OpenAI-compatibility endpoint), so this one client covers them via the preset
 * base URLs in `constants/inference/cloud-presets`.
 *
 * Privacy: this sends the transcript text off the device to the chosen
 * provider. It is strictly opt-in (the user selects the `cloud` completion
 * provider) and is never used for transcription, which stays local.
 */
export const CloudCompletionServiceLive = {
	async complete({
		baseUrl,
		apiKey,
		model,
		systemPrompt,
		userPrompt,
	}: CloudCompleteParams): Promise<Result<string, CloudCompletionError>> {
		// Trim the key: pasted keys often carry a trailing newline/space, which
		// would be sent as part of the Bearer token and rejected as a 401.
		const key = apiKey.trim();
		if (!key) {
			return Err({
				message:
					'No API key set for the cloud provider. Add one in Settings → Transformation.',
				offline: false,
			});
		}

		const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

		// Cloud providers don't send permissive CORS headers, so the webview's
		// global `fetch` is blocked (it throws a TypeError that looks like an
		// offline failure). On desktop, route through Tauri's HTTP plugin, which
		// performs the request in Rust and bypasses CORS. On web, fall back to the
		// global `fetch`. (The local llama-server / Ollama clients can use the
		// global `fetch` because localhost sends `Access-Control-Allow-Origin: *`.)
		const httpFetch = window.__TAURI_INTERNALS__
			? (await import('@tauri-apps/plugin-http')).fetch
			: fetch;

		let response: Awaited<ReturnType<typeof httpFetch>>;
		try {
			response = await httpFetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${key}`,
					// The desktop HTTP client sends a browser `Origin`, so Anthropic
					// treats this as direct browser access and rejects it (401 "CORS
					// requests must set 'anthropic-dangerous-direct-browser-access'
					// header") unless we opt in. Safe here: the key is stored locally
					// on-device, not exposed to a public web page. Other
					// OpenAI-compatible providers ignore this header.
					'anthropic-dangerous-direct-browser-access': 'true',
				},
				body: JSON.stringify({
					model,
					messages: [
						{ role: 'system', content: systemPrompt },
						{ role: 'user', content: userPrompt },
					],
					stream: false,
				}),
			});
		} catch {
			// `fetch` rejects ONLY when no HTTP response came back at all — a
			// transport/connectivity failure (no network, DNS failure, connection
			// refused, timeout). HTTP error *statuses* resolve normally and are
			// handled below, so this is the only branch that should set `offline`.
			// We classify by control flow rather than by error-string matching
			// because the desktop path goes through Tauri's HTTP plugin (reqwest in
			// Rust), whose messages differ from the browser's "Failed to fetch"
			// (e.g. Windows "os error 10061"); string matching missed those and
			// broke the opt-in fallback-to-local.
			return Err({
				message:
					'Could not reach the cloud provider. Check your internet connection, or switch the completion provider to a local backend in Settings → Transformation.',
				offline: true,
			});
		}

		if (!response.ok) {
			const body = await response.text().catch(() => '');
			if (response.status === 401 || response.status === 403) {
				return Err({
					message: `Authentication failed (${response.status}). Check the API key in Settings → Transformation.`,
					offline: false,
				});
			}
			if (response.status === 429) {
				return Err({
					message:
						'Cloud provider rate limit reached (429). Wait a moment and try again.',
					offline: false,
				});
			}
			return Err({
				message: `Cloud provider returned ${response.status}: ${body || response.statusText}`,
				offline: false,
			});
		}

		const data = (await response
			.json()
			.catch(() => ({}))) as OpenAiChatResponse;
		return Ok(data.choices?.[0]?.message?.content ?? '');
	},
};

export type CloudCompletionService = typeof CloudCompletionServiceLive;
