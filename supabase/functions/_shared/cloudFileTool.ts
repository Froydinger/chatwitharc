import type { ClaimedCloudRun, RegisteredCloudTool } from "./cloudRunWorker.ts";
import type { CloudToolDefinition } from "./cloudRunProvider.ts";
import type { CloudPresentation } from "./cloudRunArtifacts.ts";
import {
  generateDocx,
  generatePptx,
  generateSimplePDF,
  generateZipFile,
} from "./cloudFileRenderers.ts";

const MIME = {
  pdf: "application/pdf",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx:
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  txt: "text/plain",
  md: "text/markdown",
  html: "text/html",
  json: "application/json",
  csv: "text/csv",
} as const;
export const CLOUD_FILE_DEFINITION: CloudToolDefinition = {
  type: "function",
  name: "generate_file",
  strict: true,
  description:
    "Create a downloadable file from FINISHED content, never a prompt. No additional AI generation occurs. PDF accepts plain text (ASCII font; Unicode punctuation normalized). DOCX content is JSON {title,sections:[{type:heading|subheading|paragraph|bullets|numbered|divider|spacer,content:string|string[]}]}. PPTX content is JSON {slides:[{title,type:title|section|content|bullets|quote,subtitle?,content:string|string[]}]}. ZIP content is JSON {files:[{name,content:string}]} (UTF-8 text entries). Other formats accept literal file content; JSON must be valid. doc and markdown normalize to docx and md.",
  parameters: {
    type: "object",
    properties: {
      fileType: {
        type: "string",
        enum: [...Object.keys(MIME), "doc", "markdown"],
      },
      fileName: {
        type: "string",
        description:
          "Base name without extension, letters, numbers, spaces, underscores and hyphens only.",
      },
      content: {
        type: "string",
        description: "Complete content, at most 200000 UTF-8 bytes.",
      },
    },
    required: ["fileType", "fileName", "content"],
    additionalProperties: false,
  },
};
export async function cloudFileHash(
  value: string | Uint8Array,
): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof value === "string"
          ? new TextEncoder().encode(value)
          : new Uint8Array(value),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function cloudFileArguments(raw: string) {
  if (raw.length > 1200000) throw new Error("File arguments too large");
  const a = JSON.parse(raw);
  if (
    !a || typeof a !== "object" || Array.isArray(a) ||
    Object.keys(a).some((k) =>
      !["fileType", "fileName", "content"].includes(k)
    ) ||
    typeof a.fileType !== "string" || typeof a.fileName !== "string" ||
    !/^[\p{L}\p{N} _-]{1,100}$/u.test(a.fileName) || !a.fileName.trim() ||
    typeof a.content !== "string" || !a.content.trim() ||
    new TextEncoder().encode(a.content).length > 200000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(a.content)
  ) throw new Error("Invalid file arguments");
  const type = a.fileType === "doc"
    ? "docx"
    : a.fileType === "markdown"
    ? "md"
    : a.fileType;
  if (!Object.hasOwn(MIME, type)) throw new Error("Unsupported file format");
  if (["docx", "pptx", "zip", "json"].includes(type)) {
    const value = JSON.parse(a.content);
    const text = (v: unknown): boolean =>
      typeof v === "string" &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
    const body = (v: unknown) =>
      text(v) || Array.isArray(v) && v.length <= 500 && v.every(text);
    if (
      type === "docx" &&
      (!value || (value.title !== undefined && !text(value.title)) ||
        !Array.isArray(value.sections) || !value.sections.length ||
        value.sections.length > 500 ||
        value.sections.some((s: any) =>
          !s ||
          ![
            "heading",
            "subheading",
            "paragraph",
            "bullets",
            "numbered",
            "divider",
            "spacer",
          ].includes(s.type) || !body(s.content)
        ))
    ) throw new Error("Invalid document sections");
    if (
      type === "pptx" &&
      (!value || !Array.isArray(value.slides) || !value.slides.length ||
        value.slides.length > 100 ||
        value.slides.some((s: any) =>
          !s || !text(s.title) || !body(s.content) ||
          (s.subtitle !== undefined && !text(s.subtitle)) ||
          s.notes !== undefined ||
          (s.type !== undefined &&
            !["title", "section", "content", "bullets", "quote"].includes(
              s.type,
            ))
        ))
    ) throw new Error("Invalid slides");
    if (type === "zip") {
      const names = new Set<string>();
      if (
        !value || !Array.isArray(value.files) || !value.files.length ||
        value.files.length > 100 || value.files.some((f: any) => {
          if (
            !f || typeof f.name !== "string" || f.name.length > 200 ||
            /[\\:\u0000-\u001f]/.test(f.name) ||
            f.name.split("/").some((p: string) =>
              !p || p === "." || p === ".."
            ) || !text(f.content) || names.has(f.name.toLowerCase())
          ) return true;
          names.add(f.name.toLowerCase());
          return false;
        })
      ) throw new Error("Invalid ZIP entries");
    }
  }
  return {
    type: type as keyof typeof MIME,
    fileName: `${a.fileName.trim()}.${type}`,
    content: a.content as string,
  };
}
export async function renderCloudFile(
  a: ReturnType<typeof cloudFileArguments>,
) {
  const bytes = a.type === "pdf"
    ? await generateSimplePDF(a.content)
    : a.type === "docx"
    ? await generateDocx(a.content)
    : a.type === "pptx"
    ? await generatePptx(a.content)
    : a.type === "zip"
    ? await generateZipFile(a.content)
    : new TextEncoder().encode(a.content);
  if (bytes.length > 6000000) throw new Error("Rendered file too large");
  return { bytes, mimeType: MIME[a.type] };
}
export type CloudFileReceipt = {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  mime_type: string;
  prompt: string;
};
export interface CloudFileStore {
  read(id: string, owner: string): Promise<CloudFileReceipt | null>;
  /** Create only; reconcile existing bytes by digest. Never overwrite. */
  put(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  url(path: string): string;
  /** Insert only; on conflict/ambiguous completion read back by id AND owner. */
  commit(receipt: CloudFileReceipt): Promise<CloudFileReceipt>;
}
export type CloudGeneratedFile = {
  success: true;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileType: string;
  id: string;
};
export function cloudFileTool(
  options: {
    store: CloudFileStore;
    authorizeOwner(run: ClaimedCloudRun): Promise<boolean>;
  },
): RegisteredCloudTool {
  return {
    approval: "never",
    replaySafe: true,
    authorize: async (run, call) =>
      call.name === "generate_file" && await options.authorizeOwner(run),
    execute: async (run, call, key) => {
      if (call.name !== "generate_file" || !await options.authorizeOwner(run)) {
        throw new Error("File authorization denied");
      }
      if (
        !/^[a-f0-9-]{36}$/i.test(run.user_id) || !run.lease_token ||
        key !== `${run.id}:turn:${run.checkpoint.engine?.turns}:tool:${call.id}`
      ) throw new Error("Invalid file claim");
      let args: ReturnType<typeof cloudFileArguments>;
      try {
        args = cloudFileArguments(call.arguments);
      } catch {
        return JSON.stringify({
          success: false,
          error:
            "Invalid file arguments. Supply finished content matching the schema.",
        });
      }
      const hash = await cloudFileHash(JSON.stringify([run.user_id, key]));
      const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${
        hash.slice(13, 16)
      }-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      const path = `${run.user_id}/cloud/${id}/${args.fileName}`;
      const fingerprint = `cloud-file-v1:${await cloudFileHash(
        call.arguments,
      )}`;
      const confirm = (r: CloudFileReceipt): CloudGeneratedFile => {
        if (
          r.id !== id || r.user_id !== run.user_id ||
          r.prompt !== fingerprint || r.file_url !== options.store.url(path) ||
          r.file_type !== args.type || r.file_name !== args.fileName ||
          r.mime_type !== MIME[args.type] ||
          !Number.isSafeInteger(r.file_size) || r.file_size <= 0
        ) throw new Error("File receipt conflict");
        return {
          success: true,
          id,
          fileUrl: r.file_url,
          fileName: r.file_name,
          mimeType: r.mime_type,
          fileSize: r.file_size,
          fileType: r.file_type,
        };
      };
      let receipt = await options.store.read(id, run.user_id);
      if (!receipt) {
        const { bytes, mimeType } = await renderCloudFile(args);
        if (!await options.authorizeOwner(run)) {
          throw new Error("File authorization changed");
        }
        await options.store.put(path, bytes, mimeType);
        if (!await options.authorizeOwner(run)) {
          throw new Error("File authorization changed before commit");
        }
        receipt = await options.store.commit({
          id,
          user_id: run.user_id,
          file_name: args.fileName,
          file_url: options.store.url(path),
          file_type: args.type,
          file_size: bytes.length,
          mime_type: mimeType,
          prompt: fingerprint,
        });
      }
      const file = confirm(receipt);
      // Main must add generated_file to the artifact whitelist/message mapper.
      const presentation: CloudPresentation & {
        generated_file: CloudGeneratedFile;
      } = { generated_file: file };
      return { output: JSON.stringify(file), presentation };
    },
  };
}
