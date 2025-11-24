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
          ['react', { runtime: 'automatic' }],
          ...(lang === 'tsx' ? ['typescript'] : [])
        ],
        filename: `component.${lang === 'tsx' ? 'tsx' : 'jsx'}`
      });

      const transpiledCode = transformed.code || '';

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
            <script type="module">
              try {
                const { createElement: h, useState, useEffect, useRef, useMemo, useCallback } = React;
                const { createRoot } = ReactDOM;

                // Create jsx runtime for automatic runtime
                const jsx = (type, props, key) => h(type, { ...props, key });
                const jsxs = jsx;
                const Fragment = React.Fragment;

                ${transpiledCode}

                // Try to find and render the default export or the last component
                const root = createRoot(document.getElementById('root'));

                // Look for default export or App component
                if (typeof App !== 'undefined') {
                  root.render(h(App));
                } else {
                  // Try to render any component found in the code
                  const componentMatch = reactCode.match(/(?:function|const)\\s+(\\w+)\\s*(?:=|\\()/);
                  if (componentMatch) {
                    const componentName = componentMatch[1];
                    if (typeof window[componentName] !== 'undefined') {
                      root.render(h(window[componentName]));
                    } else {
                      root.render(h('div', { className: 'p-4' }, 'Component rendered successfully'));
                    }
                  }
                }
              } catch (err) {
                document.getElementById('root').innerHTML =
                  '<div style="padding: 16px; color: red; background: #fee; border: 1px solid red; border-radius: 8px; margin: 16px;">Error: ' + err.message + '<pre style="margin-top: 8px; font-size: 12px;">' + err.stack + '</pre></div>';
                console.error(err);
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
    } catch (err: any) {
      setError(`Transpilation error: ${err.message}`);
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
