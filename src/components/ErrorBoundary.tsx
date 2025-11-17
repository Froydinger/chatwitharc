import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1a1a',
          color: 'white',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <div style={{ maxWidth: '400px' }}>
            <h1 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>Something went wrong</h1>
            <p style={{ marginBottom: '1rem', color: '#999' }}>
              The app encountered an error. Please try refreshing the page.
            </p>
            <button
              onClick={() => {
                // Clear non-auth storage and reload
                try {
                  // Preserve Supabase auth session
                  const authKeys = Object.keys(localStorage).filter(key =>
                    key.startsWith('sb-') || key.includes('supabase')
                  );
                  const preservedAuth: Record<string, string> = {};
                  authKeys.forEach(key => {
                    const value = localStorage.getItem(key);
                    if (value) preservedAuth[key] = value;
                  });

                  // Clear everything
                  localStorage.clear();
                  sessionStorage.clear();

                  // Restore auth
                  Object.entries(preservedAuth).forEach(([key, value]) => {
                    localStorage.setItem(key, value);
                  });
                } catch (e) {
                  console.error('Failed to clear storage:', e);
                }
                window.location.reload();
              }}
              style={{
                background: '#00cdff',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                marginTop: '1rem'
              }}
            >
              Refresh App
            </button>
            {this.state.error && (
              <details style={{ marginTop: '2rem', textAlign: 'left', fontSize: '12px', color: '#666' }}>
                <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>Error Details</summary>
                <pre style={{
                  background: '#000',
                  padding: '1rem',
                  borderRadius: '4px',
                  overflow: 'auto',
                  maxHeight: '200px'
                }}>
                  {this.state.error.toString()}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
