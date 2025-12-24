import { useMemo } from "react";
import * as React from "react";
import { AlertCircle, AlertTriangle } from "lucide-react";

interface CodePreviewProps {
  code: string;
  language: string;
}

export function CodePreview({ code, language }: CodePreviewProps) {
  const { htmlContent, showWarning } = useMemo(() => {
    const needsWarning = language === "html" || language === "javascript" || language === "js";
    
    if (language === "html") {
      return { htmlContent: code, showWarning: needsWarning };
    } else if (language === "css") {
      return {
        htmlContent: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
                ${code}
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
        `,
        showWarning: false
      };
    } else if (language === "javascript" || language === "js") {
      return {
        htmlContent: `
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
                  const output = document.getElementById('output');
                  const originalLog = console.log;
                  console.log = (...args) => {
                    const div = document.createElement('div');
                    div.textContent = args.join(' ');
                    output.appendChild(div);
                    originalLog(...args);
                  };

                  ${code}
                } catch (err) {
                  const errorDiv = document.createElement('div');
                  errorDiv.style.color = 'red';
                  errorDiv.textContent = 'Error: ' + err.message;
                  document.getElementById('output').appendChild(errorDiv);
                }
              </script>
            </body>
          </html>
        `,
        showWarning: needsWarning
      };
    } else {
      // For other languages (React, Python, TypeScript, etc.), just show the code
      return {
        htmlContent: `
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
        `,
        showWarning: false
      };
    }
  }, [code, language]);

  return (
    <div className="border-t border-border/40 h-full overflow-auto">
      {showWarning && (
        <div className="p-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="text-xs">Code preview runs in a sandboxed environment for security.</span>
        </div>
      )}
      <iframe
        className="w-full min-h-[600px] h-full bg-white"
        srcDoc={htmlContent}
        sandbox="allow-scripts allow-forms allow-modals allow-popups"
        title="Code Preview"
      />
    </div>
  );
}
