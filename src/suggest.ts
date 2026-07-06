/** Levenshtein edit distance (two-row DP). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/** Closest candidate within an edit-distance budget, or undefined. */
export function didYouMean(input: string, candidates: Iterable<string>): string | undefined {
  const lower = input.toLowerCase();
  let best: string | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const dist = levenshtein(lower, candidate.toLowerCase());
    const budget = dist <= 3 && dist * 2 <= Math.max(input.length, candidate.length);
    if (budget && dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Property names a schema accepts: its `properties` keys, recursing through `allOf` and local
 * `$ref` targets.
 */
export function propertyCandidates(schema: unknown, rootSchema: unknown): string[] {
  const found = new Set<string>();
  const visited = new Set<unknown>();
  const visit = (node: unknown, depth: number): void => {
    if (depth > 8 || node === null || typeof node !== "object" || visited.has(node)) return;
    visited.add(node);
    const obj = node as Record<string, unknown>;
    if (obj.properties !== null && typeof obj.properties === "object") {
      for (const key of Object.keys(obj.properties as object)) found.add(key);
    }
    if (Array.isArray(obj.allOf)) {
      for (const sub of obj.allOf) visit(sub, depth + 1);
    }
    if (typeof obj.$ref === "string") {
      if (obj.$ref === "#") visit(rootSchema, depth + 1);
      else if (obj.$ref.startsWith("#/")) {
        visit(resolveLocalPointer(rootSchema, obj.$ref.slice(1)), depth + 1);
      }
    }
  };
  visit(schema, 0);
  return [...found];
}

function resolveLocalPointer(root: unknown, pointer: string): unknown {
  let node = root;
  for (const raw of pointer.split("/").slice(1)) {
    const segment = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}
