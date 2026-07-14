import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error('VITE_SUPABASE_URL is not configured');
}
const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/download-files`;
const CURRENT_MAC_VERSION = '5.1.14';
const CURRENT_MAC_DOWNLOAD = 'https://github.com/Froydinger/chatwitharc/releases/download/v5.1.14/ArcAI-5.1.14-arm64.dmg';

const resolveDownloadUrl = (value: string) => {
  if (/^https?:\/\//i.test(value)) return value;
  return `${STORAGE_BASE}/${encodeURIComponent(value)}`;
};

interface PlatformDownload {
  version: string;
  url: string;
  filename: string;
}

interface DownloadInfo {
  mac: PlatformDownload;
  windows: PlatformDownload;
  loading: boolean;
  /** @deprecated Use mac.version */
  version: string;
  /** @deprecated Use mac.url */
  url: string;
  /** @deprecated Use mac.filename */
  filename: string;
}

export function useDownloadInfo(): DownloadInfo {
  const [macVersion, setMacVersion] = useState(CURRENT_MAC_VERSION);
  const [macFilename, setMacFilename] = useState(CURRENT_MAC_DOWNLOAD);
  const [winVersion, setWinVersion] = useState('1.0.0');
  const [winFilename, setWinFilename] = useState('ArcAi Setup 1.0.0.exe');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDownloadInfo = async () => {
      try {
        const { data, error } = await supabase
          .from('admin_settings')
          .select('key, value')
          .in('key', ['download_version', 'download_filename', 'download_version_windows', 'download_filename_windows']);

        if (!error && data) {
          for (const setting of data) {
            if (setting.key === 'download_version') setMacVersion(setting.value);
            if (setting.key === 'download_filename') setMacFilename(setting.value);
            if (setting.key === 'download_version_windows') setWinVersion(setting.value);
            if (setting.key === 'download_filename_windows') setWinFilename(setting.value);
          }
        }
      } catch (err) {
        console.error('Failed to fetch download info:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDownloadInfo();
  }, []);

  return {
    mac: {
      version: macVersion,
      url: resolveDownloadUrl(macFilename),
      filename: macFilename,
    },
    windows: {
      version: winVersion,
      url: resolveDownloadUrl(winFilename),
      filename: winFilename,
    },
    loading,
    // Backwards compat
    version: macVersion,
    url: resolveDownloadUrl(macFilename),
    filename: macFilename,
  };
}
