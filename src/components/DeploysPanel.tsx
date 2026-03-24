import { useEffect, useState } from 'react';
import { Globe, ExternalLink, Settings2, Loader2, Plus, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { PublishedSite, deletePublishedSite } from '@/lib/publishedSites';
import { SiteManageModal } from '@/components/SiteManageModal';
import { unpublishFromNetlify } from '@/lib/deploy';
import { toast } from 'sonner';

export function DeploysPanel() {
  const [sites, setSites] = useState<PublishedSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [manageSite, setManageSite] = useState<PublishedSite | null>(null);

  useEffect(() => {
    loadSites();
  }, []);

  const loadSites = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('published_sites' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSites((data ?? []) as PublishedSite[]);
    } catch (err) {
      toast.error('Failed to load sites');
    } finally {
      setLoading(false);
    }
  };

  const handleSiteUpdated = (updated: PublishedSite) => {
    setSites(prev => prev.map(s => s.id === updated.id ? updated : s));
  };

  const handleSiteUnpublished = async (site: PublishedSite) => {
    setSites(prev => prev.filter(s => s.id !== site.id));
  };

  const filtered = search.trim()
    ? sites.filter(s =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.subdomain.toLowerCase().includes(search.toLowerCase())
      )
    : sites;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/20 sticky top-0 bg-background/80 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="h-3.5 w-3.5 text-primary" />
            </div>
            Published sites
            {sites.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal">({sites.length})</span>
            )}
          </h2>
        </div>
        {sites.length > 3 && (
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sites…"
            className="h-8 text-sm bg-muted/30 border-border/30"
          />
        )}
      </div>

      <div className="px-4 py-3 space-y-2 pb-24">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-muted/30 flex items-center justify-center">
              <Rocket className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {search ? 'No matching sites' : 'No published sites yet'}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                {search ? 'Try a different search' : 'Generate some code and hit Publish'}
              </p>
            </div>
          </div>
        ) : (
          filtered.map(site => <SiteCard key={site.id} site={site} onManage={() => setManageSite(site)} />)
        )}
      </div>

      {manageSite && (
        <SiteManageModal
          open={!!manageSite}
          onClose={() => setManageSite(null)}
          site={manageSite}
          onUpdated={(updated) => {
            handleSiteUpdated(updated);
            setManageSite(updated);
          }}
          onUnpublished={() => {
            handleSiteUnpublished(manageSite);
            setManageSite(null);
          }}
        />
      )}
    </div>
  );
}

function SiteCard({ site, onManage }: { site: PublishedSite; onManage: () => void }) {
  const faviconSrc = site.favicon_data
    ?? (site.favicon_svg ? `data:image/svg+xml,${encodeURIComponent(site.favicon_svg)}` : null);

  return (
    <div className="group flex items-center gap-3 p-3 rounded-xl border border-border/30 bg-card/40 hover:border-primary/20 hover:bg-card/70 transition-all">
      {/* Favicon */}
      <div className="w-10 h-10 flex-shrink-0 rounded-lg border border-border/20 overflow-hidden bg-muted/30 flex items-center justify-center">
        {faviconSrc
          ? <img src={faviconSrc} alt="" className="w-full h-full object-contain" />
          : <Globe className="w-5 h-5 text-muted-foreground" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{site.title}</p>
        <p className="text-xs text-muted-foreground truncate font-mono">
          {site.url.replace('https://', '')}
        </p>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5">
          {new Date(site.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <a
          href={site.url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          title="View live site"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <button
          onClick={onManage}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          title="Manage site"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
