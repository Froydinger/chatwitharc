import type { ReactNode } from "react";
import { FileText, X } from "lucide-react";

type Props = {
  files: readonly File[];
  onClear: () => void;
  onRemove: (index: number) => void;
} & (
  | { kind: "documents" }
  | { kind: "images"; previewUrls: readonly string[]; children?: ReactNode }
);

/** Controlled preview presentation. Files, previews, uploads and access checks stay with the composer. */
export function AttachmentTray(props: Props) {
  const { files, onClear, onRemove } = props;
  if (props.kind === "documents") return (
    <div className="rounded-3xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-xl px-4 py-3 mx-auto max-w-[760px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">Documents ({files.length}/3)</span>
        <button onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground">
          Clear
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {files.map((doc, i) => (
          <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 group">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm text-foreground truncate flex-1">{doc.name}</span>
            <span className="text-xs text-muted-foreground">{(doc.size / 1024).toFixed(0)} KB</span>
            <button
              onClick={() => onRemove(i)}
              className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
  const { previewUrls, children } = props;
  return (
    <div className="rounded-3xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-xl px-4 py-3 mx-auto max-w-[760px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">Selected Images ({files.length}/6)</span>
        <button onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground">
          Clear All
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {files.map((f, i) => {
          const url = previewUrls[i];
          return (
            <div key={i} className="relative group shrink-0">
              <img src={url} alt={`sel-${i}`} className="w-10 h-10 sm:w-16 sm:h-16 object-cover rounded-full border border-border/40" />
              <button
                onClick={() => onRemove(i)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
      {children}
    </div>
  );
}
