/**
 * Produces a map of all Steno applications with their metadata. Currently only includes the URL,
 * which varies depending on the environment (development or production).
 *
 * These URLs are reused in Vite, Node, and Cloudflare to properly access specific app URLs.
 */
export const createApps = (env: 'development' | 'production') => {
	const isProduction = env === 'production';
	return {
		/**
		 * Main API service for the application
		 */
		API: {
			URL: isProduction ? 'https://api.steno.app' : 'http://localhost:8787',
		},
		/**
		 * Steno audio transcription application
		 */
		AUDIO: {
			URL: isProduction
				? 'https://steno.app'
				: 'http://localhost:1420',
		},
	} as const;
};

/**
 * Derives all URLs from createApps and returns them as an array.
 *
 * Useful for:
 * - CORS configuration
 * - Security policies
 * - Any scenario requiring a list of all service endpoints
 */
export const createAppUrls = (env: 'development' | 'production') =>
	Object.values(createApps(env)).map((app) => app.URL);
