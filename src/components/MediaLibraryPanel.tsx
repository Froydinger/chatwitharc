import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Image, X, Download, Search, MessageCircle, Trash2 } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SmoothImage } from "@/components/ui/smooth-image";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface GeneratedImage {
  url: string;
  prompt: string;
  sessionId: string;
  sessionTitle: string;
  timestamp: Date; // we will always coerce to a real Date
  messageId: string;
}

// Safely coerce unknown timestamp shapes to a Date
function toDate(ts: unknown): Date | null {
  if (ts instanceof Date) return ts;
  if (typeof ts === "number") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof ts === "string") {
    const parsed = Date.parse(ts);
    if (!isNaN(parsed)) {
      const d = new Date(parsed);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

export function MediaLibraryPanel() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { chatSessions, loadSession, setRightPanelOpen, syncFromSupabase, hydrateAllSessions, isHydratingAll, allSessionsHydrated } = useArcStore();
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  // Hydrate all sessions when tab is opened so images are available
  useEffect(() => {
    hydrateAllSessions();
  }, [hydrateAllSessions]);

  // Scroll to top when panel opens
  useEffect(() => {
    const container = document.querySelector('.media-library-container');
    if (container) {
      container.scrollTop = 0;
    }
  }, []);

  const isLoading = isHydratingAll && !allSessionsHydrated;

  const goToChat = (sessionId: string) => {
    loadSession(sessionId);
    navigate(`/chat/${sessionId}`);
    // Only auto-close on mobile and small tablets (< 1024px)
    if (isMobile || window.innerWidth < 1024) {
      setRightPanelOpen(false);
    }
    setSelectedImage(null);
  };

  // Extract all generated images from chat sessions
  const generatedImages = useMemo(() => {
    const images: GeneratedImage[] = [];

    chatSessions.forEach((session) => {
      session.messages.forEach((message) => {
        if (
          message?.type === "image" &&
          message?.imageUrl &&
          message?.role === "assistant"
        ) {
          const coerced = toDate(message?.timestamp);
          if (!coerced) return; // skip if timestamp is bad

          const rawPrompt: string = typeof message?.content === "string" ? message.content : "";
          const prompt = rawPrompt.startsWith("Generated image: ")
            ? rawPrompt.replace("Generated image: ", "")
            : rawPrompt;

          images.push({
            url: message.imageUrl,
            prompt,
            sessionId: session.id,
            sessionTitle: session.title ?? "Untitled chat",
            timestamp: coerced,
            messageId: message.id,
          });
        }
      });
    });

    // Safe sort now that timestamps are real Dates
    images.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return images;
  }, [chatSessions]);

  // Filter images based on search query
  const filteredImages = useMemo(() => {
    if (!searchQuery.trim()) return generatedImages;

    const query = searchQuery.toLowerCase();
    return generatedImages.filter(
      (image) =>
        image.prompt.toLowerCase().includes(query) ||
        image.sessionTitle.toLowerCase().includes(query)
    );
  }, [generatedImages, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredImages.length / ITEMS_PER_PAGE);
  const paginatedImages = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredImages.slice(startIndex, endIndex);
  }, [filteredImages, currentPage]);

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Group images by date - removed for iOS-style grid
  // const groupedImages = useMemo(() => {
  //   const groups: Record<string, GeneratedImage[]> = {};
  //   filteredImages.forEach((image) => {
  //     const dateKey = image.timestamp.toLocaleDateString();
  //     if (!groups[dateKey]) groups[dateKey] = [];
  //     groups[dateKey].push(image);
  //   });
  //   return groups;
  // }, [filteredImages]);

  const downloadImage = async (image: GeneratedImage) => {
    try {
      const response = await fetch(image.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `arcai-generated-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to download image:", error);
    }
  };

  const deleteImage = async (image: GeneratedImage) => {
    if (!supabase || !isSupabaseConfigured) {
      toast({ title: "Delete unavailable", description: "Storage is not available.", variant: "destructive" });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Not authenticated", variant: "destructive" });
        return;
      }

      // Extract filename from URL
      const urlParts = image.url.split('/');
      const fileName = urlParts[urlParts.length - 1];
      const fullPath = `${user.id}/${fileName}`;

      // Delete from storage
      await supabase.storage.from('generated-files').remove([fullPath]);
      await supabase.storage.from('avatars').remove([fullPath]);

      // Delete from database
      await supabase
        .from('generated_files')
        .delete()
        .eq('user_id', user.id)
        .ilike('file_url', `%${fileName}%`);

      // Remove from chat session messages and save
      const { saveChatToSupabase } = useArcStore.getState();
      const session = chatSessions.find(s => s.id === image.sessionId);
      if (session) {
        const updatedSession = {
          ...session,
          messages: session.messages.filter(m => m.id !== image.messageId)
        };
        await saveChatToSupabase(updatedSession);
      }

      // Refresh local state
      await syncFromSupabase();

      setSelectedImage(null);
      toast({ title: "Image deleted" });
    } catch (error) {
      console.error("Failed to delete image:", error);
      toast({ title: "Failed to delete image", variant: "destructive" });
    }
  };

  const PaginationButtons = () => {
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-between gap-2 px-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="backdrop-blur-xl bg-background/70 border-border/40"
        >
          Prev Page
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          className="backdrop-blur-xl bg-background/70 border-border/40"
        >
          Next Page
        </Button>
      </div>
    );
  };

  return (
    <div className="media-library-container w-full max-w-4xl mx-auto space-y-6 p-6 h-full overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <div className="glass rounded-full p-3">
            <Image className="h-8 w-8 text-primary-glow" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">Media Library</h2>
        </div>

        <p className="text-muted-foreground text-base">
          All your AI-generated images from conversations
        </p>

        {/* Search */}
        <div className="mx-auto max-w-2xl w-full">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search images by prompt or chat title"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Image Grid */}
      <div className="space-y-6">
        {isLoading ? (
          <div className="grid gap-2 grid-cols-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="text-center py-16">
            <GlassCard variant="bubble" glow className="p-12 max-w-md mx-auto">
              <div className="glass rounded-full p-6 w-fit mx-auto mb-6">
                <Image className="h-12 w-12 text-primary-glow" />
              </div>
              <h3 className="text-2xl font-semibold text-foreground mb-3">
                No images yet
              </h3>
              <p className="text-muted-foreground mb-8 text-lg">
                Generate some images in your chats to see them here.
              </p>
            </GlassCard>
          </div>
        ) : (
          <>
            <PaginationButtons />
            <div className="grid gap-2 grid-cols-2">
              {paginatedImages.map((image, index) => (
              <div
                key={`${image.messageId}-${index}`}
                className="aspect-square relative cursor-pointer group hover:scale-[1.02] transition-transform"
                onClick={() => setSelectedImage(image)}
              >
                <SmoothImage
                  src={image.url}
                  alt={image.prompt}
                  className="w-full h-full object-cover rounded-lg"
                  loadingClassName="bg-muted animate-pulse rounded-lg"
                  thumbnail
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <Image className="h-4 w-4 text-white" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <PaginationButtons />
        </>
        )}
      </div>

      {/* Image Modal */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl w-full p-0 bg-black/90 border-0">
          {selectedImage && (
            <div className="relative">
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="aspect-auto max-h-[80vh] overflow-hidden rounded-lg">
                <SmoothImage
                  src={selectedImage.url}
                  alt={selectedImage.prompt}
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
                <div className="flex items-end justify-between gap-4">
                  <div className="text-white space-y-1 flex-1 min-w-0">
                    <p className="text-base font-medium line-clamp-2">{selectedImage.prompt}</p>
                    <p className="text-sm text-white/70">
                      {selectedImage.timestamp.toLocaleString()}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button
                      onClick={() => goToChat(selectedImage.sessionId)}
                      className="bg-black text-white hover:bg-black/80"
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Go to Chat
                    </Button>
                    
                    <Button
                      onClick={() => downloadImage(selectedImage)}
                      className="bg-black text-white hover:bg-black/80"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Save
                    </Button>

                    <Button
                      onClick={() => deleteImage(selectedImage)}
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

        {/* Stats */}
        {generatedImages.length > 0 && (
          <div className="pt-8">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                {generatedImages.length} {generatedImages.length === 1 ? 'image' : 'images'} • {
                  new Set(
                    chatSessions
                      .filter((s) =>
                        s.messages.some(
                          (m) => m?.type === "image" && m?.role === "assistant"
                        )
                      )
                      .map((s) => s.id)
                  ).size
                } {new Set(chatSessions.filter((s) => s.messages.some((m) => m?.type === "image" && m?.role === "assistant")).map((s) => s.id)).size === 1 ? 'chat' : 'chats'}
              </p>
            </div>
          </div>
        )}
    </div>
  );
}