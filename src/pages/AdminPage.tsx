import { AdminSettingsPanel } from '@/components/AdminSettingsPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function AdminPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile-friendly header with back button */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to App</span>
          </Button>
        </div>
      </div>

      {/* Admin panel content */}
      <div className="px-4 sm:px-6 py-6">
        <AdminSettingsPanel />
      </div>
    </div>
  );
}