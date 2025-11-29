import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

// Device detection for iPad PWA
const isIpad = () => {
  const ua = navigator.userAgent;
  return (
    (ua.includes('iPad') || 
    (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) &&
    !ua.includes('iPhone')
  );
};

const isStandalone = () => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true ||
         document.referrer.includes('android-app://');
};

// Apply device-specific classes after DOM is ready
const applyDeviceClasses = () => {
  if (isStandalone()) {
    document.body.classList.add('standalone-app');
    console.log('Applied standalone-app class');
  }
  if (isIpad()) {
    document.body.classList.add('is-ipad');
    console.log('Applied is-ipad class - 30px padding will be applied');
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyDeviceClasses);
} else {
  applyDeviceClasses();
}

// Add global error handler with bug report integration
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);

  // Import the bug report store dynamically
  import('./hooks/useBugReport').then(({ useBugReport }) => {
    const errorMessage = event.error?.message || 'Unknown error';
    const errorStack = event.error?.stack || '';
    useBugReport.getState().openBugReport(errorMessage, errorStack);
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);

  // Import the bug report store dynamically
  import('./hooks/useBugReport').then(({ useBugReport }) => {
    const errorMessage = event.reason?.message || String(event.reason) || 'Promise rejection';
    const errorStack = event.reason?.stack || '';
    useBugReport.getState().openBugReport(errorMessage, errorStack);
  });
});

// Attempt to render the app with error handling
try {
  const rootElement = document.getElementById("root");

  if (!rootElement) {
    throw new Error('Root element not found');
  }

  createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
} catch (error) {
  console.error('Failed to render app:', error);

  // Show a basic error message
  const rootElement = document.getElementById("root");
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #1a1a1a; color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 2rem; text-align: center;">
        <div style="max-width: 400px;">
          <h1 style="margin-bottom: 1rem; font-size: 1.5rem;">Unable to Load App</h1>
          <p style="margin-bottom: 1rem; color: #999;">
            The app failed to initialize. This might be due to corrupted data.
          </p>
          <button
            onclick="try { localStorage.clear(); sessionStorage.clear(); } catch(e) {} window.location.reload();"
            style="background: #00cdff; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 16px; margin-top: 1rem;"
          >
            Clear Data & Reload
          </button>
        </div>
      </div>
    `;
  }
}
