import { useMemo, useState, useEffect } from "react";
import * as React from "react";

interface CodePreviewProps {
  code: string;
  language: string;
}

export function CodePreview({ code, language }: CodePreviewProps) {
  // Check if dark mode is enabled
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);
  const htmlContent = useMemo(() => {
    // Base dark mode styles
    const darkModeStyles = isDark ? `
      body {
        background-color: #1e1e1e;
        color: #d4d4d4;
      }
    ` : '';

    if (language === "html") {
      return code;
    } else if (language === "css") {
      return `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
                ${darkModeStyles}
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
        `;
    } else if (language === "javascript" || language === "js") {
      return `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
                ${darkModeStyles}
                #output {
                  background: ${isDark ? '#2d2d2d' : '#f5f5f5'};
                  border: 1px solid ${isDark ? '#404040' : '#ddd'};
                  border-radius: 8px;
                  padding: 16px;
                  margin-top: 16px;
                  min-height: 100px;
                  color: ${isDark ? '#d4d4d4' : '#000'};
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
                  errorDiv.style.color = '${isDark ? '#f48771' : 'red'}';
                  errorDiv.textContent = 'Error: ' + err.message;
                  document.getElementById('output').appendChild(errorDiv);
                }
              </script>
            </body>
          </html>
        `;
    } else {
      // For other languages (React, Python, TypeScript, etc.), just show the code
      return `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <style>
                body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; }
                ${darkModeStyles}
                .info-box {
                  background: ${isDark ? '#2d2d2d' : '#fff3e0'};
                  border: 1px solid ${isDark ? '#404040' : '#ff9800'};
                  border-radius: 8px;
                  padding: 16px;
                  margin-bottom: 16px;
                  color: ${isDark ? '#d4d4d4' : '#000'};
                }
                pre {
                  background: ${isDark ? '#1e1e1e' : '#f5f5f5'};
                  border: 1px solid ${isDark ? '#404040' : '#ddd'};
                  border-radius: 8px;
                  padding: 16px;
                  overflow-x: auto;
                  white-space: pre-wrap;
                  word-wrap: break-word;
                  color: ${isDark ? '#d4d4d4' : '#000'};
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
    }
  }, [code, language, isDark]);

  return (
    <div className="border-t border-border/40 h-full overflow-auto">
      <iframe
        className="w-full min-h-[600px] h-full"
        style={{ backgroundColor: isDark ? '#1e1e1e' : '#ffffff' }}
        srcDoc={htmlContent}
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
        title="Code Preview"
      />
    </div>
  );
}
