import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Upload, Check, Trash2, FileIcon, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAdminSettings } from '@/hooks/useAdminSettings';
import { toast } from '@/hooks/use-toast';
import { AppleLogo } from '@/components/icons/AppleLogo';
import { WindowsLogo } from '@/components/icons/WindowsLogo';

interface StorageFile {
  name: string;
  created_at: string;
  metadata: {
    size?: number;
    mimetype?: string;
  };
}

type Platform = 'mac' | 'windows';

const PLATFORM_CONFIG = {
  mac: {
    label: 'macOS',
    icon: AppleLogo,
    extensions: ['.dmg', '.pkg', '.zip'],
    filenameKey: 'download_filename',
    versionKey: 'download_version',
    filenameDesc: 'Current Mac app filename in storage',
    versionDesc: 'Current Mac app version number',
    hint: 'ArcAi-X.Y.Z.dmg',
    filter: (f: string) => /\.(dmg|pkg)$/i.test(f),
  },
  windows: {
    label: 'Windows',
    icon: WindowsLogo,
    extensions: ['.exe', '.msi', '.zip'],
    filenameKey: 'download_filename_windows',
    versionKey: 'download_version_windows',
    filenameDesc: 'Current Windows app filename in storage',
    versionDesc: 'Current Windows app version number',
    hint: 'ArcAi Setup X.Y.Z.exe',
    filter: (f: string) => /\.(exe|msi)$/i.test(f),
  },
} as const;

export function AdminDownloadManager() {
  const { getSetting, updateSetting, isAdmin } = useAdminSettings();
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    } catch (err) {
      console.error('Upload error:', err);
      toast({ title: 'Upload failed', description: err instanceof Error ? err.message : 'Failed to upload file', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (filename: string, platform: Platform) => {
    const config = PLATFORM_CONFIG[platform];
    const currentFilename = getSetting(config.filenameKey);
    if (filename === currentFilename) {
      toast({ title: "Can't delete", description: 'This is the currently active download file', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase.storage.from('download-files').remove([filename]);
      if (error) throw error;
      toast({ title: 'File deleted', description: `${filename} removed from storage` });
      await fetchFiles();
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
            Manage Mac and Windows download versions. Upload new builds and push them live.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Shared upload */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Upload New File</Label>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".dmg,.zip,.exe,.pkg,.msi"
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
              <Button variant="ghost" size="icon" onClick={fetchFiles} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload .dmg/.pkg for Mac or .exe/.msi for Windows. Version is extracted from filename automatically.
            </p>
          </div>

          <Separator />

          {/* Platform tabs */}
          <Tabs defaultValue="mac" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="mac" className="gap-2">
                <AppleLogo className="h-4 w-4" /> macOS
              </TabsTrigger>
              <TabsTrigger value="windows" className="gap-2">
                <WindowsLogo className="h-4 w-4" /> Windows
              </TabsTrigger>
            </TabsList>

            {(['mac', 'windows'] as Platform[]).map((platform) => (
              <TabsContent key={platform} value={platform}>
                <PlatformSection
                  platform={platform}
                  files={files}
                  loading={loading}
                  getSetting={getSetting}
                  updateSetting={updateSetting}
                  extractVersion={extractVersion}
                  formatSize={formatSize}
                  onDelete={(f) => handleDelete(f, platform)}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function PlatformSection({
  platform,
  files,
  loading,
  getSetting,
  updateSetting,
  extractVersion,
  formatSize,
  onDelete,
}: {
  platform: Platform;
  files: StorageFile[];
  loading: boolean;
  getSetting: (key: string) => string;
  updateSetting: (key: string, value: string, description?: string) => Promise<any>;
  extractVersion: (f: string) => string;
  formatSize: (b?: number) => string;
  onDelete: (f: string) => void;
}) {
  const config = PLATFORM_CONFIG[platform];
  const currentFilename = getSetting(config.filenameKey);
  const currentVersion = getSetting(config.versionKey);
  const [selectedFile, setSelectedFile] = useState(currentFilename || '');
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    if (currentFilename && !selectedFile) setSelectedFile(currentFilename);
  }, [currentFilename]);

  const platformFiles = files.filter(f => config.filter(f.name));

  const handlePush = async () => {
    if (!selectedFile) return;
    setPushing(true);
    try {
      const version = extractVersion(selectedFile);
      await updateSetting(config.filenameKey, selectedFile, config.filenameDesc);
      await updateSetting(config.versionKey, version, config.versionDesc);
      toast({
        title: 'Version pushed!',
        description: `${config.label} downloads now point to ${selectedFile} (v${version})`,
      });
    } catch (err) {
      toast({ title: 'Push failed', description: err instanceof Error ? err.message : 'Failed to update', variant: 'destructive' });
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="space-y-4 pt-4">
      {/* Current live */}
      <div className="flex items-center gap-3 p-4 rounded-lg border border-primary/30 bg-primary/5">
        <Check className="h-5 w-5 text-primary flex-shrink-0" />
        <div>
          <p className="font-medium">Current {config.label} Version</p>
          <p className="text-sm text-muted-foreground">
            {currentFilename
              ? <>v{currentVersion} — <span className="font-mono text-xs">{currentFilename}</span></>
              : 'No version set yet'}
          </p>
        </div>
      </div>

      {/* File list */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">{config.label} Files</Label>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : platformFiles.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No {config.label} files found. Upload a {config.hint} file above.
          </p>
        ) : (
          <div className="space-y-2">
            {platformFiles.map((file) => {
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
                    {isActive && <Badge variant="default" className="text-xs">Live</Badge>}
                    {isSelected && !isActive && <Badge variant="secondary" className="text-xs">Selected</Badge>}
                    {!isActive && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); onDelete(file.name); }}
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

      {/* Push button */}
      <Button
        onClick={handlePush}
        disabled={pushing || !selectedFile || selectedFile === currentFilename}
        className="w-full noir-send-btn gap-2"
        size="lg"
      >
        {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {pushing
          ? 'Pushing...'
          : selectedFile === currentFilename
            ? 'Already Live'
            : `Push v${extractVersion(selectedFile)} Live for ${config.label}`}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Updates all {config.label} download links across the site instantly.
      </p>
    </div>
  );
}
