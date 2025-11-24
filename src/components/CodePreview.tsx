import { useEffect, useRef, useState } from "react";
import * as React from "react";
import { AlertCircle } from "lucide-react";
import * as Babel from '@babel/standalone';

interface CodePreviewProps {
  code: string;
  language: string;
}

export function CodePreview({ code, language }: CodePreviewProps) {
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setError(null);

    try {
      if (language === "html") {
        renderHTML(code);
      } else if (language === "css") {
        renderCSS(code);
      } else if (language === "javascript" || language === "js") {
        renderJS(code);
      } else if (language === "jsx" || language === "tsx" || language === "react") {
        renderReact(code, language);
      } else {
        // For other languages (Python, TypeScript, etc.), just show the code
        renderCodeOnly(code);
      }
    } catch (err: any) {
      setError(err.message || "Failed to render preview");
    }
  }, [code, language]);

  const renderHTML = (htmlCode: string) => {
    if (!iframeRef.current) return;

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    
    if (doc) {
      doc.open();
      doc.write(htmlCode);
      doc.close();
    }
  };

  const renderCSS = (cssCode: string) => {
    if (!iframeRef.current) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
            ${cssCode}
          </style>
        </head>
        <body>
          <div class="preview-container">
            <h1>CSS Preview</h1>
            <p>This is a paragraph with the applied styles.</p>
            <button>Button</button>
          </div>
        </body>
      </html>
    `;

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    }
  };

  const renderJS = (jsCode: string) => {
    if (!iframeRef.current) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
            #output {
              background: #f5f5f5;
              border: 1px solid #ddd;
              border-radius: 8px;
              padding: 16px;
              margin-top: 16px;
              min-height: 100px;
            }
          </style>
        </head>
        <body>
          <div id="root"></div>
          <div id="output"></div>
          <script>
            try {
              // Override console.log to display in the preview
              const output = document.getElementById('output');
              const originalLog = console.log;
              console.log = (...args) => {
                const div = document.createElement('div');
                div.textContent = args.join(' ');
                output.appendChild(div);
                originalLog(...args);
              };

              ${jsCode}
            } catch (err) {
              document.getElementById('output').innerHTML =
                '<div style="color: red;">Error: ' + err.message + '</div>';
            }
          </script>
        </body>
      </html>
    `;

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;

    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    }
  };

  const renderReact = (reactCode: string, lang: string) => {
    if (!iframeRef.current) return;

    try {
      // Transpile JSX/TSX to JavaScript using Babel
      const transformed = Babel.transform(reactCode, {
        presets: [
          'react',
          ...(lang === 'tsx' ? ['typescript'] : [])
        ],
        filename: `component.${lang === 'tsx' ? 'tsx' : 'jsx'}`
      });

      const transpiledCode = transformed.code || '';

      // Extract component name from the original code
      const componentMatch = reactCode.match(/(?:export\s+default\s+)?(?:function|const|class)\s+(\w+)/);
      const componentName = componentMatch ? componentMatch[1] : 'App';

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
            <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
              * { box-sizing: border-box; }
            </style>
          </head>
          <body>
            <div id="root"></div>
            <script>
              (function() {
                try {
                  const { createElement, useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;
                  const { createRoot } = ReactDOM;

                  // Execute the transpiled code
                  ${transpiledCode}

                  // Try to render the component
                  const root = createRoot(document.getElementById('root'));

                  // Try different component names and patterns
                  let ComponentToRender = null;

                  // Check for common component names
                  if (typeof ${componentName} !== 'undefined') {
                    ComponentToRender = ${componentName};
                  } else if (typeof App !== 'undefined') {
                    ComponentToRender = App;
                  } else if (typeof Component !== 'undefined') {
                    ComponentToRender = Component;
                  } else {
                    // Try to find any function that looks like a component
                    const globalKeys = Object.keys(window);
                    for (const key of globalKeys) {
                      if (typeof window[key] === 'function' && key[0] === key[0].toUpperCase()) {
                        ComponentToRender = window[key];
                        break;
                      }
                    }
                  }

                  if (ComponentToRender) {
                    root.render(createElement(ComponentToRender));
                  } else {
                    root.render(createElement('div', {
                      style: { padding: '16px', color: '#666' }
                    }, 'No component found to render. Make sure your component is exported or defined.'));
                  }
                } catch (err) {
                  console.error('Render error:', err);
                  document.getElementById('root').innerHTML =
                    '<div style="padding: 16px; color: red; background: #fee; border: 1px solid red; border-radius: 8px; margin: 16px;"><strong>Error:</strong> ' + err.message + '<pre style="margin-top: 8px; font-size: 12px; overflow: auto;">' + (err.stack || '') + '</pre></div>';
                }
              })();
            </script>
          </body>
        </html>
      `;

      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;

      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    } catch (err: any) {
      setError(`Transpilation error: ${err.message}`);
      console.error('Transpilation error:', err);
    }
  };

  const renderCodeOnly = (code: string) => {
    if (!iframeRef.current) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
            .info-box { 
              background: #fff3e0; 
              border: 1px solid #ff9800; 
              border-radius: 8px; 
              padding: 16px; 
              margin-bottom: 16px;
            }
            pre { 
              background: #f5f5f5; 
              border: 1px solid #ddd; 
              border-radius: 8px; 
              padding: 16px; 
              overflow-x: auto;
              white-space: pre-wrap;
              word-wrap: break-word;
            }
          </style>
        </head>
        <body>
          <div class="info-box">
            <strong>📄 Code Preview (${language})</strong>
            <p>Preview not available for this language. Copy the code to use in your development environment.</p>
          </div>
          <pre><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
        </body>
      </html>
    `;

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    }
  };

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border-t border-destructive/20">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border/40 h-full overflow-auto">
      <iframe
        ref={iframeRef}
        className="w-full min-h-[600px] h-full bg-white"
        sandbox="allow-scripts allow-same-origin"
        title="Code Preview"
        scrolling="yes"
      />
    </div>
  );
}
