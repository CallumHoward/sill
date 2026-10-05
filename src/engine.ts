import Ajv, { type AnySchemaObject, type ValidateFunction } from "ajv";
import AjvDraft04 from "ajv-draft-04";
import addFormatsImport from "ajv-formats";
import Ajv2019 from "ajv/dist/2019.js";
import Ajv2020 from "ajv/dist/2020.js";
import type AjvCore from "ajv/dist/core.js";
import draft06Meta from "ajv/dist/refs/json-schema-draft-06.json" with { type: "json" };

// ajv-formats is CJS; under ESM interop the callable may sit on .default.
const addFormats = (
  typeof addFormatsImport === "function"
    ? addFormatsImport
    : (addFormatsImport as { default: typeof addFormatsImport }).default
) as (ajv: AjvCore) => AjvCore;

export type Dialect = "2020-12" | "2019-09" | "draft-07" | "draft-06" | "draft-04";

/** Map a schema's $schema meta-URI to its dialect; default to the latest. */
export function dialectOf(metaSchema?: unknown): Dialect {
  const meta = typeof metaSchema === "string" ? metaSchema : "";
  if (meta.includes("2019-09")) return "2019-09";
  if (meta.includes("draft-04")) return "draft-04";
  if (meta.includes("draft-06")) return "draft-06";
  if (meta.includes("draft-07")) return "draft-07";
  return "2020-12";
}

export interface Engine {
  /** Compile a schema, caching per URI so N files share one validator. */
  compile(uri: string, schema: AnySchemaObject): Promise<ValidateFunction>;
}

export interface EngineOptions {
  /** Resolver for remote $refs encountered during compilation. */
  loadSchema: (uri: string) => Promise<AnySchemaObject>;
  validateFormats: boolean;
}

export function createEngine(options: EngineOptions): Engine {
  const instances = new Map<Dialect, AjvCore>();
  const compiled = new Map<string, Promise<ValidateFunction>>();

  function instanceFor(dialect: Dialect): AjvCore {
    let ajv = instances.get(dialect);
    if (ajv) return ajv;
    const opts = {
      allErrors: true,
      strict: false,
      validateFormats: options.validateFormats,
      loadSchema: options.loadSchema,
      // Schema-authoring noise (unknown formats/keywords) is not our finding
      // to report; real failures still throw or surface as errors.
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    };
    switch (dialect) {
      case "2020-12": {
        ajv = new Ajv2020(opts);
        break;
      }
      case "2019-09": {
        ajv = new Ajv2019(opts);
        break;
      }
      case "draft-04": {
        ajv = new AjvDraft04(opts);
        break;
      }
      case "draft-06": {
        ajv = new Ajv(opts);
        ajv.addMetaSchema(draft06Meta);
        break;
      }
      case "draft-07": {
        ajv = new Ajv(opts);
        break;
      }
    }
    addFormats(ajv);
    instances.set(dialect, ajv);
    return ajv;
  }

  async function compileNow(uri: string, schema: AnySchemaObject): Promise<ValidateFunction> {
    const dialect = dialectOf(schema.$schema);
    const ajv = instanceFor(dialect);
    // Anchor relative $refs: a schema fetched from a URI but lacking an id
    // resolves references against that URI.
    if (!schema.$id && !schema.id) {
      const idKey = dialect === "draft-04" ? "id" : "$id";
      schema = { ...schema, [idKey]: uri };
    }
    const existing = ajv.getSchema(uri);
    if (existing) return existing;
    return ajv.compileAsync(schema);
  }

  return {
    compile(uri, schema) {
      let promise = compiled.get(uri);
      if (!promise) {
        promise = compileNow(uri, schema);
        compiled.set(uri, promise);
      }
      return promise;
    },
  };
}
