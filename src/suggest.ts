/** Levenshtein edit distance (two-row DP). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = Array.from({ length: b.length + 1 }, () => 0);
  for (let row = 1; row <= a.length; row++) {
    current[0] = row;
    for (let column = 1; column <= b.length; column++) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + cost,
      );
    }
    [previous, current] = [current, previous];
  }
  return previous[b.length] ?? 0;
}

/** Closest candidate within an edit-distance budget, or undefined. */
export function didYouMean(input: string, candidates: Iterable<string>): string | undefined {
  const lower = input.toLowerCase();
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = levenshtein(lower, candidate.toLowerCase());
    const budget = distance <= 3 && distance * 2 <= Math.max(input.length, candidate.length);
    if (budget && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
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
  // fallow-ignore-next-line complexity
  const visit = (node: unknown, depth: number): void => {
    if (depth > 8 || node === null || typeof node !== "object" || visited.has(node)) return;
    visited.add(node);
    const object = node as Record<string, unknown>;
    if (object["properties"] !== null && typeof object["properties"] === "object") {
      for (const key of Object.keys(object["properties"])) found.add(key);
    }
    if (Array.isArray(object["allOf"])) {
      for (const sub of object["allOf"]) visit(sub, depth + 1);
    }
    if (typeof object["$ref"] === "string") {
      if (object["$ref"] === "#") visit(rootSchema, depth + 1);
      else if (object["$ref"].startsWith("#/")) {
        visit(resolveLocalPointer(rootSchema, object["$ref"].slice(1)), depth + 1);
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
