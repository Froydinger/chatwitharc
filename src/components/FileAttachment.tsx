import { Download, FileText, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FILE_TYPE_ICONS, FILE_TYPE_COLORS } from "@/types/file";
import { cn } from "@/lib/utils";

interface FileAttachmentProps {
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize?: number;
  className?: string;
}

export const FileAttachment = ({
  fileName,
  fileUrl,
  fileType,
  fileSize,
  className
}: FileAttachmentProps) => {
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreview = () => {
    window.open(fileUrl, '_blank');
  };

  const icon = FILE_TYPE_ICONS[fileType] || FILE_TYPE_ICONS.default;
  const gradientColor = FILE_TYPE_COLORS[fileType] || FILE_TYPE_COLORS.default;

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-br backdrop-blur-sm transition-all hover:border-primary/50 hover:shadow-lg",
      gradientColor,
      className
    )}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* File Icon */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-background/50 text-2xl backdrop-blur-sm">
            {icon}
          </div>

          {/* File Info */}
          <div className="min-w-0 flex-1">
            <h4 className="truncate font-medium text-foreground">
              {fileName}
            </h4>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="uppercase">{fileType}</span>
              {fileSize && (
                <>
                  <span>•</span>
                  <span>{formatFileSize(fileSize)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownload}
            className="flex-1 gap-2"
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
          {['pdf', 'txt', 'html', 'json', 'xml', 'md'].includes(fileType) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handlePreview}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              Preview
            </Button>
          )}
        </div>
      </div>

      {/* Hover Effect */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
};
