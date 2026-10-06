/** Development-only local fixture. All API calls are intercepted by the browser test. */
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@/hooks/useAuth';
import { SubscriptionProvider } from '@/hooks/useSubscription';
import { ImageQuotaProvider } from '@/hooks/useImageQuota';
import { ImageOptionsContent } from '@/components/ImageOptionsDock';
import { ImageUsageAdmin } from '@/components/admin/ImageUsageAdmin';
import '@/index.css';
if (!import.meta.env.DEV) throw new Error('Local QA only');
createRoot(document.getElementById('root')!).render(<AuthProvider><SubscriptionProvider><ImageQuotaProvider><main className="p-4 mx-auto max-w-5xl space-y-8"><ImageOptionsContent/>{location.search.includes('admin')&&<ImageUsageAdmin/>}</main></ImageQuotaProvider></SubscriptionProvider></AuthProvider>);
