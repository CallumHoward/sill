import type { ParserAdapter } from "../types.ts";
import { json5Adapter } from "./json5.ts";
import { jsoncAdapter } from "./jsonc.ts";
import { tomlAdapter } from "./toml.ts";
import { yamlAdapter } from "./yaml.ts";

export const parsers: ParserAdapter[] = [jsoncAdapter, json5Adapter, yamlAdapter, tomlAdapter];

const byExtension = new Map<string, ParserAdapter>(
  parsers.flatMap((adapter) => adapter.extensions.map((ext) => [ext, adapter])),
);

export function adapterForPath(path: string): ParserAdapter | null {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return null;
  return byExtension.get(path.slice(dot).toLowerCase()) ?? null;
}
