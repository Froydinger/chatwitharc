import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

type Status = 'loading' | 'valid' | 'already_unsubscribed' | 'invalid' | 'success' | 'error';

const UnsubscribePage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }

    const validate = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${token}`;
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        const data = await res.json();
        if (data.valid === false && data.reason === 'already_unsubscribed') {
          setStatus('already_unsubscribed');
        } else if (data.valid) {
          setStatus('valid');
        } else {
          setStatus('invalid');
        }
      } catch {
        setStatus('error');
      }
    };
    validate();
  }, [token]);

  const handleUnsubscribe = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('handle-email-unsubscribe', {
        body: { token },
      });
      if (error) throw error;
      if (data?.success) setStatus('success');
      else if (data?.reason === 'already_unsubscribed') setStatus('already_unsubscribed');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6 p-8 rounded-2xl bg-card border border-border">
        {status === 'loading' && <p className="text-muted-foreground">Verifying…</p>}

        {status === 'valid' && (
          <>
            <h1 className="text-2xl font-bold text-foreground">Unsubscribe</h1>
            <p className="text-muted-foreground">
              Are you sure you want to unsubscribe from ArcAI emails?
            </p>
            <button
              onClick={handleUnsubscribe}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
            >
              Confirm Unsubscribe
            </button>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 className="text-2xl font-bold text-foreground">You're unsubscribed</h1>
            <p className="text-muted-foreground">You won't receive any more app emails from ArcAI.</p>
          </>
        )}

        {status === 'already_unsubscribed' && (
          <>
            <h1 className="text-2xl font-bold text-foreground">Already unsubscribed</h1>
            <p className="text-muted-foreground">You've already unsubscribed from these emails.</p>
          </>
        )}

        {status === 'invalid' && (
          <>
            <h1 className="text-2xl font-bold text-foreground">Invalid link</h1>
            <p className="text-muted-foreground">This unsubscribe link is invalid or has expired.</p>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
            <p className="text-muted-foreground">Please try again later or contact support.</p>
          </>
        )}
      </div>
    </div>
  );
};

export default UnsubscribePage;
