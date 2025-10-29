import { useState } from "react";
import { Download, FileText, Code, Archive, FileType } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { useToast } from "@/hooks/use-toast";
import { useArcStore } from "@/store/useArcStore";

export function ExportPanel() {
  const { messages, chatSessions, currentSessionId } = useArcStore();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const currentSession = chatSessions.find(s => s.id === currentSessionId);

  const exportAsPDF = async () => {
    setExporting(true);
    try {
      // Format message content with proper line breaks and paragraph separation
      const formatContent = (content: string) => {
        if (!content) return '[No text content]';
        
        return content
          .split('\n')
          .map(line => {
            const trimmed = line.trim();
            if (!trimmed) return '<br>';
            
            // Headers (lines starting with # or all caps with less than 50 chars)
            if (trimmed.startsWith('#') || (trimmed === trimmed.toUpperCase() && trimmed.length < 50 && trimmed.length > 3)) {
              return `<h3 style="margin: 16px 0 8px 0; font-size: 16px; font-weight: bold;">${trimmed.replace(/^#+\s*/, '')}</h3>`;
            }
            
            // Regular paragraph
            return `<p style="margin: 8px 0; line-height: 1.6;">${trimmed}</p>`;
          })
          .join('');
      };
      
      // Create HTML content for PDF
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${currentSession?.title || 'Chat Export'}</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
            h1 { color: #333; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
            .message { margin: 24px 0; padding: 16px; border-radius: 8px; page-break-inside: avoid; }
            .user { background: #e3f2fd; }
            .assistant { background: #f5f5f5; }
            .role { font-weight: bold; margin-bottom: 12px; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
            .content h3 { margin: 16px 0 8px 0; font-size: 16px; font-weight: bold; }
            .content p { margin: 8px 0; line-height: 1.6; }
            .metadata { color: #666; font-size: 11px; margin-top: 12px; padding-top: 8px; border-top: 1px solid #ddd; }
          </style>
        </head>
        <body>
          <h1>${currentSession?.title || 'Chat Export'}</h1>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Messages:</strong> ${messages.length}</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
          ${messages.map(m => `
            <div class="message ${m.role}">
              <div class="role">${m.role}</div>
              <div class="content">${formatContent(m.content)}</div>
              ${m.imageUrl ? `<div class="metadata">Image: ${m.imageUrl}</div>` : ''}
            </div>
          `).join('')}
        </body>
        </html>
      `;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentSession?.title || 'chat'}_${Date.now()}.html`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "HTML Exported",
        description: "You can print this HTML to PDF from your browser",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export as HTML/PDF",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  const exportAsTXT = () => {
    setExporting(true);
    try {
      const txtContent = `${currentSession?.title || 'Chat Export'}\n` +
        `Date: ${new Date().toLocaleDateString()}\n` +
        `Messages: ${messages.length}\n` +
        `${'='.repeat(50)}\n\n` +
        messages.map(m => 
          `[${m.role.toUpperCase()}]\n${m.content || '[No text content]'}\n${m.imageUrl ? `Image: ${m.imageUrl}\n` : ''}\n`
        ).join('\n');

      const blob = new Blob([txtContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentSession?.title || 'chat'}_${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Exported as TXT",
        description: "Chat saved as text file",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export as TXT",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  const exportAsJSON = () => {
    setExporting(true);
    try {
      const jsonContent = JSON.stringify({
        title: currentSession?.title || 'Chat Export',
        exportDate: new Date().toISOString(),
        sessionId: currentSessionId,
        messages: messages
      }, null, 2);

      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentSession?.title || 'chat'}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Exported as JSON",
        description: "Chat data exported successfully",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export as JSON",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  const exportAsHTML = () => {
    setExporting(true);
    try {
      const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${currentSession?.title || 'Chat Export'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      min-height: 100vh;
    }
    .container { 
      max-width: 900px; 
      margin: 0 auto; 
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    header { 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white; 
      padding: 30px;
      text-align: center;
    }
    h1 { font-size: 28px; margin-bottom: 10px; }
    .metadata { opacity: 0.9; font-size: 14px; }
    .chat-container { padding: 30px; }
    .message { 
      margin: 20px 0; 
      padding: 20px;
      border-radius: 12px;
      animation: slideIn 0.3s ease;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .user { 
      background: #e3f2fd;
      margin-left: 60px;
      border-left: 4px solid #2196F3;
    }
    .assistant { 
      background: #f5f5f5;
      margin-right: 60px;
      border-left: 4px solid #9c27b0;
    }
    .role { 
      font-weight: 600;
      margin-bottom: 10px;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 1px;
      color: #666;
    }
    .content { 
      line-height: 1.8;
      white-space: pre-wrap;
      word-wrap: break-word;
      color: #333;
    }
    .image-container {
      margin-top: 15px;
      border-radius: 8px;
      overflow: hidden;
    }
    .image-container img {
      max-width: 100%;
      height: auto;
      display: block;
    }
    footer {
      text-align: center;
      padding: 20px;
      color: #999;
      font-size: 12px;
      border-top: 1px solid #eee;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${currentSession?.title || 'Chat Export'}</h1>
      <div class="metadata">
        Exported on ${new Date().toLocaleString()} • ${messages.length} messages
      </div>
    </header>
    <div class="chat-container">
      ${messages.map(m => `
        <div class="message ${m.role}">
          <div class="role">${m.role === 'user' ? '👤 User' : '🤖 Assistant'}</div>
          <div class="content">${m.content || '[No text content]'}</div>
          ${m.imageUrl ? `
            <div class="image-container">
              <img src="${m.imageUrl}" alt="Message image" loading="lazy">
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
    <footer>
      Generated from Arc Chat • ${new Date().getFullYear()}
    </footer>
  </div>
</body>
</html>`;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentSession?.title || 'chat'}_${Date.now()}.html`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Exported as HTML",
        description: "Standalone HTML page created - ready for Netlify deploy!",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export as HTML",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  const exportWordPressPlugin = () => {
    setExporting(true);
    try {
      const pluginContent = `<?php
/**
 * Plugin Name: Arc Chat Export
 * Description: Exported chat session from Arc
 * Version: 1.0.0
 * Author: Arc Chat
 */

if (!defined('ABSPATH')) {
    exit;
}

class Arc_Chat_Export {
    private $chat_data = ${JSON.stringify({
      title: currentSession?.title,
      messages: messages
    })};

    public function __construct() {
        add_shortcode('arc_chat', array($this, 'render_chat'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_styles'));
    }

    public function enqueue_styles() {
        wp_enqueue_style('arc-chat-style', false, array(), '1.0.0');
        wp_add_inline_style('arc-chat-style', $this->get_inline_css());
    }

    private function get_inline_css() {
        return '
            .arc-chat-container { max-width: 800px; margin: 20px auto; padding: 20px; }
            .arc-message { margin: 15px 0; padding: 15px; border-radius: 8px; }
            .arc-user { background: #e3f2fd; margin-left: 40px; }
            .arc-assistant { background: #f5f5f5; margin-right: 40px; }
            .arc-role { font-weight: bold; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; }
            .arc-content { line-height: 1.6; }
        ';
    }

    public function render_chat($atts) {
        ob_start();
        ?>
        <div class="arc-chat-container">
            <h2><?php echo esc_html($this->chat_data['title'] ?? 'Chat Export'); ?></h2>
            <?php foreach ($this->chat_data['messages'] as $message): ?>
                <div class="arc-message arc-<?php echo esc_attr($message['role']); ?>">
                    <div class="arc-role"><?php echo esc_html($message['role']); ?></div>
                    <div class="arc-content"><?php echo wp_kses_post($message['content']); ?></div>
                </div>
            <?php endforeach; ?>
        </div>
        <?php
        return ob_get_clean();
    }
}

new Arc_Chat_Export();
`;

      const blob = new Blob([pluginContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arc-chat-export.php`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "WordPress Plugin Created",
        description: "Upload to /wp-content/plugins/ and use [arc_chat] shortcode",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to create WordPress plugin",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  if (messages.length === 0) {
    return (
      <div className="w-full max-w-3xl mx-auto space-y-4 pt-4 px-4 pb-4 h-full flex items-center justify-center">
        <GlassCard className="p-8 text-center">
          <FileText className="h-12 w-12 text-primary-glow mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No Messages to Export</h3>
          <p className="text-muted-foreground">Start a conversation first</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4 pt-4 px-4 pb-4 h-full overflow-y-auto scrollbar-hide">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-foreground">Export Chat</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard className="p-6 hover:bg-glass/60 transition-all">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-2">HTML (for PDF)</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Print-ready HTML that can be saved as PDF from your browser
              </p>
              <GlassButton 
                variant="glow" 
                onClick={exportAsPDF}
                disabled={exporting}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Export HTML
              </GlassButton>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6 hover:bg-glass/60 transition-all">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <FileType className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-2">Plain Text</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Simple text file with chat conversation
              </p>
              <GlassButton 
                variant="glow" 
                onClick={exportAsTXT}
                disabled={exporting}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Export TXT
              </GlassButton>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6 hover:bg-glass/60 transition-all">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Code className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-2">JSON Data</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Raw data format for developers and integrations
              </p>
              <GlassButton 
                variant="glow" 
                onClick={exportAsJSON}
                disabled={exporting}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </GlassButton>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6 hover:bg-glass/60 transition-all">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Code className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-2">Netlify HTML</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Standalone HTML - drag & drop into Netlify
              </p>
              <GlassButton 
                variant="glow" 
                onClick={exportAsHTML}
                disabled={exporting}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Export HTML
              </GlassButton>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6 hover:bg-glass/60 transition-all md:col-span-2">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Archive className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-2">WordPress Plugin</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Creates a WordPress plugin file - upload to /wp-content/plugins/ and use [arc_chat] shortcode
              </p>
              <GlassButton 
                variant="glow" 
                onClick={exportWordPressPlugin}
                disabled={exporting}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Create WP Plugin
              </GlassButton>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="p-4 mt-6">
        <p className="text-sm text-muted-foreground">
          <strong>Current Session:</strong> {currentSession?.title || 'Untitled'} • {messages.length} messages
        </p>
      </GlassCard>
    </div>
  );
}
