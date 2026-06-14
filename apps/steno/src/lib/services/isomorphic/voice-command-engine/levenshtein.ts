/**
 * Computes the Levenshtein distance between two strings.
 * Returns a similarity ratio between 0 (completely different) and 1 (identical).
 */
export function levenshteinSimilarity(a: string, b: string): number {
	if (a === b) return 1;
	const lenA = a.length;
	const lenB = b.length;
	if (lenA === 0 || lenB === 0) return 0;

	// Use single-row optimization (O(min(m,n)) space)
	let prev = Array.from({ length: lenB + 1 }, (_, i) => i);
	let curr = new Array<number>(lenB + 1);

	for (let i = 1; i <= lenA; i++) {
		curr[0] = i;
		for (let j = 1; j <= lenB; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			// biome-ignore lint/style/noNonNullAssertion: bounds guaranteed by loop
			curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
		}
		[prev, curr] = [curr, prev];
	}

	// biome-ignore lint/style/noNonNullAssertion: lenB is always valid index
	const distance = prev[lenB]!;
	return 1 - distance / Math.max(lenA, lenB);
}
