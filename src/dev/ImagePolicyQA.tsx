/** Development-only local fixture. All API calls are intercepted by the browser test. */
import { ImageEditModal } from '@/components/ImageEditModal';
import { useImageGenStore, type ImageMode } from '@/store/useImageGenStore';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@/hooks/useAuth';
import { SubscriptionProvider } from '@/hooks/useSubscription';
import { ImageQuotaProvider } from '@/hooks/useImageQuota';
import { ImageOptionsContent } from '@/components/ImageOptionsDock';
import { PlanUsageBreakdown } from '@/components/PlanUsageBreakdown';
import { ImageUsageAdmin } from '@/components/admin/ImageUsageAdmin';
import '@/index.css';
if (!import.meta.env.DEV) throw new Error('Local QA only');
const mode = new URLSearchParams(location.search).get('mode');
if (['low','image','pro','lite'].includes(mode ?? '')) useImageGenStore.getState().setImageMode(mode as ImageMode);
window.addEventListener('processImageEdit', e => Object.assign(window, {fixtureEditRequest:(e as CustomEvent).detail}));
createRoot(document.getElementById('root')!).render(<AuthProvider><SubscriptionProvider><ImageQuotaProvider><main className="p-4 mx-auto max-w-5xl space-y-8">{location.search.includes('edit')&&<ImageEditModal isOpen onClose={()=>{}} imageUrl="/placeholder.svg"/>}{location.search.includes('dashboard')?<PlanUsageBreakdown/>:<ImageOptionsContent/>}{location.search.includes('admin')&&<ImageUsageAdmin/>}</main></ImageQuotaProvider></SubscriptionProvider></AuthProvider>);
