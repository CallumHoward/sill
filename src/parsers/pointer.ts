/**
 * Split an Ajv instancePath (RFC 6901 JSON pointer) into unescaped segments. Array indices stay
 * strings; adapters coerce when indexing sequences.
 */
export function pointerSegments(instancePath: string): string[] {
  if (instancePath === "") return [];
  return instancePath
    .split("/")
    .slice(1)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}
