import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Download, Upload, Check, Trash2, FileIcon, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { toast } from '@/hooks/use-toast';

interface StorageFile {
  name: string;
  created_at: string;
  metadata: {
    size?: number;
    mimetype?: string;
  };
}

export function AdminDownloadManager() {
  const { getSetting, updateSetting, isAdmin } = useAdminSettings();
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentFilename = getSetting('download_filename');
  const currentVersion = getSetting('download_version');

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('download-files')
        .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

      if (error) throw error;
      setFiles((data || []).filter(f => f.name !== '.emptyFolderPlaceholder'));
    } catch (err) {
      console.error('Failed to list files:', err);
      toast({ title: 'Error', description: 'Failed to list download files', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchFiles();
  }, [isAdmin]);

  useEffect(() => {
    if (currentFilename && !selectedFile) {
      setSelectedFile(currentFilename);
    }
  }, [currentFilename]);

  const extractVersion = (filename: string): string => {
    const match = filename.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : 'unknown';
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from('download-files')
        .upload(file.name, file, { upsert: true });

      if (error) throw error;

      toast({ title: 'Upload complete', description: `${file.name} uploaded successfully` });
      await fetchFiles();
      setSelectedFile(file.name);
    } catch (err) {
      console.error('Upload error:', err);
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Failed to upload file', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePush = async () => {
    if (!selectedFile) return;

    setPushing(true);
    try {
      const version = extractVersion(selectedFile);
      await updateSetting('download_filename', selectedFile, 'Current Mac app filename in storage');
      await updateSetting('download_version', version, 'Current Mac app version number');

      toast({
        title: 'Version pushed!',
        description: `All download links now point to ${selectedFile} (v${version})`,
      });
    } catch (err) {
      toast({ title: 'Push failed', description: err instanceof Error ? err.message : 'Failed to update', variant: 'destructive' });
    } finally {
      setPushing(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (filename === currentFilename) {
      toast({ title: "Can't delete", description: 'This is the currently active download file', variant: 'destructive' });
      return;
    }

    try {
      const { error } = await supabase.storage
        .from('download-files')
        .remove([filename]);

      if (error) throw error;

      toast({ title: 'File deleted', description: `${filename} removed from storage` });
      await fetchFiles();
      if (selectedFile === filename) setSelectedFile(currentFilename);
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Failed to delete', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Download Version Manager
          </CardTitle>
          <CardDescription>
            Select which file users download across all links on the site. Upload new versions and push them live in one click.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current version indicator */}
          <div className="flex items-center gap-3 p-4 rounded-lg border border-primary/30 bg-primary/5">
            <Check className="h-5 w-5 text-primary flex-shrink-0" />
            <div>
              <p className="font-medium">Current Live Version</p>
              <p className="text-sm text-muted-foreground">
                v{currentVersion} — <span className="font-mono text-xs">{currentFilename}</span>
              </p>
            </div>
          </div>

          <Separator />

          {/* Upload section */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Upload New Version</Label>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".dmg,.zip,.exe,.pkg"
                onChange={handleUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="gap-2"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? 'Uploading...' : 'Upload File'}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={fetchFiles}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Name your file like <span className="font-mono">ArcAi-X.Y.Z.dmg</span> — the version is extracted automatically.
            </p>
          </div>

          <Separator />

          {/* File list */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Available Files</Label>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : files.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No files found in storage</p>
            ) : (
              <div className="space-y-2">
                {files.map((file) => {
                  const isActive = file.name === currentFilename;
                  const isSelected = file.name === selectedFile;
                  const version = extractVersion(file.name);

                  return (
                    <div
                      key={file.name}
                      onClick={() => setSelectedFile(file.name)}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border hover:border-primary/30 hover:bg-accent/50'
                      }`}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted">
                        <FileIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          v{version} • {formatSize(file.metadata?.size)} • {new Date(file.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isActive && (
                          <Badge variant="default" className="text-xs">Live</Badge>
                        )}
                        {isSelected && !isActive && (
                          <Badge variant="secondary" className="text-xs">Selected</Badge>
                        )}
                        {!isActive && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(file.name);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          {/* Push button */}
          <Button
            onClick={handlePush}
            disabled={pushing || !selectedFile || selectedFile === currentFilename}
            className="w-full noir-send-btn gap-2"
            size="lg"
          >
            {pushing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {pushing
              ? 'Pushing...'
              : selectedFile === currentFilename
                ? 'Already Live'
                : `Push v${extractVersion(selectedFile)} Live`
            }
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            This updates all download links across the entire site instantly.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
