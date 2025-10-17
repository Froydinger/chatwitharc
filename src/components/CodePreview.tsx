import { useEffect, useRef, useState } from "react";
import * as React from "react";
import { AlertCircle } from "lucide-react";

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
      if (language === "html" || language === "jsx" || language === "tsx") {
        renderHTML(code);
      } else if (language === "css") {
        renderCSS(code);
      } else if (language === "javascript" || language === "typescript") {
        renderJS(code);
      }
    } catch (err: any) {
      setError(err.message || "Failed to render preview");
    }
  }, [code, language]);

  const renderHTML = (htmlCode: string) => {
    if (!iframeRef.current) return;

    // Extract React/JSX if present
    let processedCode = htmlCode;
    
    // If it's JSX/TSX, wrap it in a basic HTML template
    if (language === "jsx" || language === "tsx") {
      processedCode = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
            <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
            <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
            <style>
              body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
            </style>
          </head>
          <body>
            <div id="root"></div>
            <script type="text/babel">
              ${htmlCode}
              
              // Auto-render if there's a default export or a component
              if (typeof App !== 'undefined') {
                ReactDOM.render(<App />, document.getElementById('root'));
              }
            </script>
          </body>
        </html>
      `;
    }

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    
    if (doc) {
      doc.open();
      doc.write(processedCode);
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
    <div className="border-t border-border/40">
      <iframe
        ref={iframeRef}
        className="w-full min-h-[300px] bg-white"
        sandbox="allow-scripts allow-same-origin"
        title="Code Preview"
      />
    </div>
  );
}
