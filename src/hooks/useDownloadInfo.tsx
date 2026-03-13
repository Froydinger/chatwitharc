import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_BASE = 'https://jxywhodnndagbsmnbnnw.supabase.co/storage/v1/object/public/download-files';

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
  const [macVersion, setMacVersion] = useState('4.0.9');
  const [macFilename, setMacFilename] = useState('ArcAi-4.0.9.dmg');
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
      url: `${STORAGE_BASE}/${encodeURIComponent(macFilename)}`,
      filename: macFilename,
    },
    windows: {
      version: winVersion,
      url: `${STORAGE_BASE}/${encodeURIComponent(winFilename)}`,
      filename: winFilename,
    },
    loading,
    // Backwards compat
    version: macVersion,
    url: `${STORAGE_BASE}/${macFilename}`,
    filename: macFilename,
  };
}
