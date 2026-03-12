import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_BASE = 'https://jxywhodnndagbsmnbnnw.supabase.co/storage/v1/object/public/download-files';

interface DownloadInfo {
  version: string;
  url: string;
  filename: string;
  loading: boolean;
}

export function useDownloadInfo(): DownloadInfo {
  const [version, setVersion] = useState('4.0.9');
  const [filename, setFilename] = useState('ArcAi-4.0.9.dmg');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDownloadInfo = async () => {
      try {
        const { data, error } = await supabase
          .from('admin_settings')
          .select('key, value')
          .in('key', ['download_version', 'download_filename']);

        if (!error && data) {
          for (const setting of data) {
            if (setting.key === 'download_version') setVersion(setting.value);
            if (setting.key === 'download_filename') setFilename(setting.value);
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
    version,
    url: `${STORAGE_BASE}/${filename}`,
    filename,
    loading,
  };
}
