import type { CloudToolDefinition } from "./cloudRunProvider.ts";
import type { ClaimedCloudRun, RegisteredCloudTool } from "./cloudRunWorker.ts";

export type AppFiles = Record<string, { content: string; language: string }>;
export type AppWorkspace = {
  projectId: string;
  version: number;
  baseRevision: number;
  files: AppFiles;
};
export type AppChanges = {
  expectedVersion: number;
  writes: { path: string; content: string; language: string }[];
  deletes: string[];
};
export type AppStepResult = {
  status: string;
  version?: number;
  replayed?: boolean;
  result?: Record<string, unknown>;
};
export type AppPublishArgs = {
  subdomain: string;
  title: string;
  description: string;
};
export interface CloudAppPorts {
  authorize(run: ClaimedCloudRun): Promise<boolean>;
  open(run: ClaimedCloudRun): Promise<AppWorkspace>;
  apply(
    run: ClaimedCloudRun,
    call: { id: string; name: string; arguments: string },
    key: string,
  ): Promise<AppStepResult>;
  publish?(
    run: ClaimedCloudRun,
    call: { id: string; name: string; arguments: string },
    key: string,
  ): Promise<AppStepResult>;
}
export const APP_SYSTEM_PATHS = [
  "src/lib/netlifyDb.ts",
  "src/components/NetlifyAuthModal.tsx",
];
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object.");
  }
  return value as Record<string, unknown>;
};
function keys(value: Record<string, unknown>, expected: string[]) {
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  ) throw new Error("Unexpected or missing fields.");
}
export function appPath(path: unknown): string {
  if (
    typeof path !== "string" || path.length > 300 ||
    !/^[A-Za-z0-9_][A-Za-z0-9_.-]*(\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/.test(path)
  ) throw new Error("Invalid relative project path.");
  return path;
}
export function appFiles(value: unknown): AppFiles {
  const files = object(value);
  if (
    Object.keys(files).length > 200 ||
    new TextEncoder().encode(JSON.stringify(files)).length > 4_000_000
  ) throw new Error("Project exceeds file limits.");
  const result: AppFiles = Object.create(null);
  for (const [path, raw] of Object.entries(files)) {
    appPath(path);
    const file = typeof raw === "string"
      ? { content: raw, language: "" }
      : object(raw);
    if (
      typeof file.content !== "string" || file.content.length > 500_000 ||
      (file.language !== undefined &&
        (typeof file.language !== "string" || file.language.length > 40))
    ) throw new Error("Invalid project file.");
    result[path] = {
      content: file.content,
      language: typeof file.language === "string" ? file.language : "",
    };
  }
  return result;
}
export function appChanges(raw: unknown): AppChanges {
  const args = object(raw);
  keys(args, ["expectedVersion", "writes", "deletes"]);
  if (
    !Number.isSafeInteger(args.expectedVersion) ||
    (args.expectedVersion as number) < 0 ||
    !Array.isArray(args.writes) || !Array.isArray(args.deletes) ||
    args.writes.length + args.deletes.length < 1 ||
    args.writes.length + args.deletes.length > 50
  ) throw new Error("Invalid version or change count.");
  const seen = new Set<string>();
  const path = (value: unknown) => {
    const p = appPath(value);
    if (seen.has(p) || APP_SYSTEM_PATHS.includes(p)) {
      throw new Error("Duplicate or protected system file.");
    }
    seen.add(p);
    return p;
  };
  const writes = args.writes.map((raw) => {
    const file = object(raw);
    keys(file, ["path", "content", "language"]);
    if (
      typeof file.content !== "string" || file.content.length > 500_000 ||
      typeof file.language !== "string" || file.language.length > 40
    ) throw new Error("Invalid file content/language.");
    return {
      path: path(file.path),
      content: file.content,
      language: file.language,
    };
  });
  return {
    expectedVersion: args.expectedVersion as number,
    writes,
    deletes: args.deletes.map(path),
  };
}
export function appPublishArgs(raw: unknown): AppPublishArgs {
  const args = object(raw);
  keys(args, ["subdomain", "title", "description"]);
  if (
    typeof args.subdomain !== "string" || args.subdomain.length > 50 ||
    (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(args.subdomain) && args.subdomain !== "")
  ) throw new Error("Invalid publish address.");
  if (
    typeof args.title !== "string" || !args.title.trim() ||
    args.title.length > 160 || typeof args.description !== "string" ||
    args.description.length > 320
  ) throw new Error("Invalid publish metadata.");
  return {
    subdomain: args.subdomain.toLowerCase(),
    title: args.title.trim(),
    description: args.description.trim(),
  };
}
const parameters = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const CLOUD_APP_DEFINITIONS: CloudToolDefinition[] = [
  {
    type: "function",
    name: "inspect_app",
    description:
      "Read the current durable draft version and file list. Does not run or deploy code.",
    strict: true,
    parameters: parameters({}),
  },
  {
    type: "function",
    name: "read_app_file",
    description:
      "Read a bounded chunk of one file from the durable draft. Continue at nextOffset if truncated.",
    strict: true,
    parameters: parameters({
      path: { type: "string", maxLength: 300 },
      offset: { type: "integer", minimum: 0, maximum: 500000 },
      limit: { type: "integer", minimum: 1, maximum: 20000 },
    }),
  },
  {
    type: "function",
    name: "apply_app_files",
    description:
      "Atomically save a new draft version with full file writes/deletions. Requires the current draft version; never runs or deploys code.",
    strict: true,
    parameters: parameters({
      expectedVersion: { type: "integer", minimum: 0 },
      writes: {
        type: "array",
        maxItems: 50,
        items: parameters({
          path: { type: "string", maxLength: 300 },
          content: { type: "string", maxLength: 500000 },
          language: { type: "string", maxLength: 40 },
        }),
      },
      deletes: {
        type: "array",
        maxItems: 50,
        items: { type: "string", maxLength: 300 },
      },
    }),
  },
  {
    type: "function",
    name: "publish_app",
    description:
      "Publish the current saved app draft to a live askarc.chat address. This is an external action and always requires user approval. Call only after the requested app is complete and the user asked for it to be live.",
    strict: true,
    parameters: parameters({
      subdomain: {
        type: "string",
        maxLength: 50,
        description: "Lowercase address slug, or empty to let Arc choose one.",
      },
      title: { type: "string", maxLength: 160 },
      description: { type: "string", maxLength: 320 },
    }),
  },
];

export function cloudAppTools(
  ports: CloudAppPorts,
): Record<string, RegisteredCloudTool> {
  const tool = (name: string): RegisteredCloudTool => ({
    approval: name === "apply_app_files"
      ? "ask-mode"
      : name === "publish_app"
      ? "always"
      : "never",
    // Publication has a durable plan + reconciliation path, so retrying the
    // same receipt can safely recover a deploy whose acknowledgement was lost.
    replaySafe: true,
    authorize: (run) => ports.authorize(run),
    execute: async (run, call, key) => {
      let args: Record<string, unknown>;
      try {
        args = object(JSON.parse(call.arguments));
        if (name === "apply_app_files") appChanges(args);
        else if (name === "publish_app") appPublishArgs(args);
        else if (name === "read_app_file") {
          keys(args, ["path", "offset", "limit"]);
          appPath(args.path);
          if (
            !Number.isSafeInteger(args.offset) || (args.offset as number) < 0 ||
            (args.offset as number) > 500000 ||
            !Number.isSafeInteger(args.limit) || (args.limit as number) < 1 ||
            (args.limit as number) > 20000
          ) throw new Error("Invalid file chunk bounds.");
        } else keys(args, []);
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : "Invalid arguments.",
          performed: false,
        });
      }
      if (!await ports.authorize(run)) {
        return JSON.stringify({
          error: "App access denied.",
          performed: false,
        });
      }
      if (name === "apply_app_files") {
        const result = await ports.apply(run, call, key);
        return JSON.stringify({
          ...result,
          saved: result.status === "saved",
          executed: false,
          tested: false,
          deployed: false,
        });
      }
      if (name === "publish_app") {
        if (!ports.publish) {
          return JSON.stringify({
            error: "Publishing is temporarily unavailable.",
            performed: false,
          });
        }
        const result = await ports.publish(run, call, key);
        return JSON.stringify({
          ...result,
          published: result.status === "published",
          performed: result.status === "published",
        });
      }
      const workspace = await ports.open(run);
      if (name === "read_app_file") {
        const file = workspace.files[args.path as string];
        const end = file
          ? Math.min(
            file.content.length,
            (args.offset as number) + (args.limit as number),
          )
          : 0;
        return JSON.stringify(
          file
            ? {
              version: workspace.version,
              path: args.path,
              language: file.language,
              content: file.content.slice(args.offset as number, end),
              nextOffset: end,
              truncated: end < file.content.length,
            }
            : { error: "File not found.", version: workspace.version },
        );
      }
      return JSON.stringify({
        projectId: workspace.projectId,
        version: workspace.version,
        files: Object.entries(workspace.files).map(([path, file]) => ({
          path,
          characters: file.content.length,
        })),
      });
    },
  });
  return Object.fromEntries(
    CLOUD_APP_DEFINITIONS.map((def) => [def.name, tool(def.name)]),
  );
}
