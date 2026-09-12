import { ExternalLink, Globe2, Search, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { SmoothImage } from "@/components/ui/smooth-image";
import { ImageModal } from "@/components/ImageModal";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

interface SearchSource {
  title?: string;
  url: string;
  snippet?: string;
}

interface SearchResultsCardProps {
  content: string;
  sources: SearchSource[];
  query?: string;
  images?: string[];
}

const carouselDotColors = [
  "bg-primary",
  "bg-sky-400",
  "bg-amber-400",
  "bg-emerald-400",
] as const;

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function SearchResultsCard({ content, sources, query, images = [] }: SearchResultsCardProps) {
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [carouselTurn, setCarouselTurn] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const turnRef = useRef(0);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startTurn: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();
  const visibleImages = images.slice(0, 4).filter((url) => !failedImages.has(url));
  const imageCount = visibleImages.length;
  const imageSignature = visibleImages.join("\u0001");
  const activeImageIndex = imageCount === 0
    ? 0
    : ((Math.round(carouselTurn) % imageCount) + imageCount) % imageCount;
  const spread = Math.min(138, Math.max(68, carouselWidth * 0.28 || 92));

  const updateTurn = useCallback((nextTurn: number) => {
    turnRef.current = nextTurn;
    setCarouselTurn(nextTurn);
  }, []);

  const cancelSettle = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const settleTo = useCallback((targetTurn: number) => {
    cancelSettle();

    const startTurn = turnRef.current;
    if (prefersReducedMotion || Math.abs(targetTurn - startTurn) < 0.001) {
      updateTurn(targetTurn);
      return;
    }

    const startTime = performance.now();
    const duration = 620;
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - (1 - progress) ** 4;
      updateTurn(startTurn + (targetTurn - startTurn) * eased);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [cancelSettle, prefersReducedMotion, updateTurn]);

  useEffect(() => {
    const node = carouselRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      setCarouselWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    updateTurn(0);
  }, [imageSignature, updateTurn]);

  useEffect(() => () => cancelSettle(), [cancelSettle]);

  const goToNextImage = useCallback(() => {
    if (imageCount > 1) settleTo(Math.round(turnRef.current) + 1);
  }, [imageCount, settleTo]);

  const goToPreviousImage = useCallback(() => {
    if (imageCount > 1) settleTo(Math.round(turnRef.current) - 1);
  }, [imageCount, settleTo]);

  const handleImageError = (url: string) => {
    setFailedImages((current) => new Set(current).add(url));
  };

  const handleImageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToPreviousImage();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goToNextImage();
    } else if (event.key === "Home") {
      event.preventDefault();
      settleTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      settleTo(Math.max(imageCount - 1, 0));
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (imageCount <= 1) return;

    cancelSettle();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startTurn: turnRef.current,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
      moved: false,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const distance = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(distance) > 3) {
      drag.moved = true;
      suppressClickRef.current = true;
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
    }

    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
    drag.velocity = (drag.velocity + (event.clientX - drag.lastX) / elapsed) / 2;
    drag.lastX = event.clientX;
    drag.lastTime = event.timeStamp;
    updateTurn(drag.startTurn - distance / 136);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const fling = Math.max(-2, Math.min(2, (-drag.velocity * 140) / 136));
    settleTo(Math.round(turnRef.current + (drag.moved ? fling : 0)));
    if (drag.moved) {
      // Suppress the synthetic click produced by a drag, but do not leave the
      // next intentional tap blocked if the browser targets the carousel after
      // pointer capture.
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
  };

  const getCardState = (index: number) => {
    const angle = (index - carouselTurn) * (Math.PI * 2 / Math.max(imageCount, 1));
    const front = (Math.cos(angle) + 1) / 2;
    return {
      x: Math.sin(angle) * spread,
      y: -(1 - front) * 22,
      scale: 1 - Math.min(150, 100) / 200 * (1 - front),
      zIndex: Math.round(front * 100),
      rotate: [-4.2, 2.6, -1.4, 3.8][index % 4],
      float: 2.5 + (index % 4) * 0.45,
      sway: 0.6 + (index % 4) * 0.14,
    };
  };

  return (
    <>
    <div
      className={cn(
        "min-w-0 w-[min(46rem,calc(100vw-2.5rem))] max-w-full overflow-hidden rounded-3xl",
        "border border-primary/20 bg-background/80 shadow-[0_18px_60px_-28px_hsl(var(--primary)/0.45)] ring-1 ring-foreground/[0.04] backdrop-blur-2xl",
      )}
    >
      <div className="flex items-center gap-3 border-b border-border/45 bg-muted/15 px-4 py-3 sm:px-5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-foreground/10" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary/35" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
          <Search className="h-3.5 w-3.5 text-primary" />
          <span className="truncate">{query || "Arc Search"}</span>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Complete</span>
      </div>

      <div className="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="mt-0.5 rounded-2xl border border-primary/20 bg-primary/10 p-2.5 text-primary shadow-inner">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Search result</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Synthesized from {sources.length} source{sources.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5 sm:pb-5">
        <div className="search-result-copy rounded-2xl border border-border/40 bg-background/45 px-4 py-4 text-foreground/90 sm:px-5">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ node, ...props }) => <p className="mb-3 text-base leading-relaxed last:mb-0" {...props} />,
              h1: ({ node, ...props }) => <h1 className="mb-2 mt-4 text-xl font-bold first:mt-0" {...props} />,
              h2: ({ node, ...props }) => <h2 className="mb-2 mt-4 text-lg font-semibold first:mt-0" {...props} />,
              h3: ({ node, ...props }) => <h3 className="mb-1.5 mt-3 text-base font-semibold first:mt-0" {...props} />,
              ul: ({ node, ...props }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
              ol: ({ node, ...props }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
              li: ({ node, ...props }) => <li className="text-base leading-relaxed" {...props} />,
              strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
              a: ({ node, ...props }) => (
                <a
                  className="text-primary underline underline-offset-2 hover:text-primary/80"
                  target="_blank"
                  rel="noopener noreferrer"
                  {...props}
                />
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>

      {sources.length > 0 && (
        <div className="border-t border-border/45 bg-muted/20 px-4 py-4 sm:px-5">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Sources used
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {sources.slice(0, 6).map((source, index) => (
              <a
                key={`${source.url}-${index}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-border/45 bg-background/65 px-3 py-2.5 transition-colors hover:border-primary/35 hover:bg-background"
              >
                <Globe2 className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {source.title || sourceHost(source.url)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{sourceHost(source.url)}</p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70 group-hover:text-primary" />
              </a>
            ))}
          </div>
        </div>
      )}

      {visibleImages.length > 0 && (
        <div className="border-t border-border/45 bg-muted/10 px-4 py-4 sm:px-5">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Images</p>
            <div className="hidden items-center gap-2 sm:flex" role="group" aria-label="Choose search result image">
              {visibleImages.map((url, index) => {
                const isActive = index === activeImageIndex;
                return <button
                  key={`dot-${url}`}
                  type="button"
                  aria-label={`Show search result image ${index + 1}`}
                  aria-pressed={isActive}
                  onClick={() => settleTo(index)}
                  className={cn(
                    "h-2.5 w-2.5 rounded-full transition-[transform,opacity,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none",
                    carouselDotColors[index % carouselDotColors.length],
                    isActive
                      ? "scale-125 opacity-100 shadow-[0_0_12px_hsl(var(--primary)/0.75)]"
                      : "opacity-45 hover:scale-110 hover:opacity-85",
                  )}
                />;
              })}
            </div>
          </div>

          <div
            ref={carouselRef}
            className={cn(
              "relative mx-auto min-w-0 w-full max-w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isDragging ? "cursor-grabbing" : "cursor-grab",
            )}
            role="group"
            aria-roledescription="carousel"
            aria-label="Search result images"
            tabIndex={0}
            onKeyDown={handleImageKeyDown}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <div
              className="relative h-[clamp(15rem,32vw,18rem)] max-h-[18rem] overflow-hidden rounded-3xl py-2"
              style={{ touchAction: "pan-y" }}
              data-held={isDragging}
            >
              {visibleImages.map((url, index) => {
                const isActive = index === activeImageIndex;
                const cardState = getCardState(index);

                return (
                  <div
                    key={url}
                    className="pointer-events-none absolute inset-0"
                    style={{ zIndex: cardState.zIndex }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <motion.div
                        className="h-[84%] w-[66%] sm:h-[88%] sm:w-[58%]"
                        animate={{
                          x: cardState.x,
                          y: cardState.y,
                          scale: cardState.scale,
                          rotate: cardState.rotate,
                        }}
                        transition={isDragging
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 320, damping: 28, mass: 0.7 }}
                      >
                        <motion.div
                          className="h-full w-full"
                          animate={prefersReducedMotion
                            ? undefined
                            : {
                                y: [-cardState.float, cardState.float, -cardState.float],
                                rotate: [-cardState.sway, cardState.sway, -cardState.sway],
                              }}
                          transition={{
                            duration: 5.3 + index * 0.4,
                            ease: "easeInOut",
                            repeat: Infinity,
                          }}
                        >
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (suppressClickRef.current) {
                              suppressClickRef.current = false;
                              return;
                            }
                            if (isActive) setSelectedImage(url);
                          }}
                          onPointerMove={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
                            const y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
                            event.currentTarget.style.setProperty("--card-rotate-x", `${(-y * 6).toFixed(2)}deg`);
                            event.currentTarget.style.setProperty("--card-rotate-y", `${(x * 6).toFixed(2)}deg`);
                            event.currentTarget.style.setProperty("--card-lift", isActive ? "0.5px" : "0px");
                          }}
                          onPointerLeave={(event) => {
                            event.currentTarget.style.setProperty("--card-rotate-x", "0deg");
                            event.currentTarget.style.setProperty("--card-rotate-y", "0deg");
                            event.currentTarget.style.setProperty("--card-lift", "0px");
                          }}
                          className={cn(
                            "group pointer-events-auto block h-full w-full select-none overflow-hidden rounded-2xl border border-border/55 bg-muted/20 text-left shadow-[0_18px_42px_-22px_hsl(var(--foreground)/0.75)] outline-none transition-[filter,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-primary/80 motion-reduce:transition-none",
                            isActive ? "cursor-grab active:cursor-grabbing hover:shadow-[0_22px_48px_-20px_hsl(var(--primary)/0.38)]" : "cursor-default",
                          )}
                          style={{
                            pointerEvents: isActive ? "auto" : "none",
                            transform: "perspective(760px) rotateX(var(--card-rotate-x, 0deg)) rotateY(var(--card-rotate-y, 0deg)) translateZ(var(--card-lift, 0px))",
                          }}
                          aria-hidden={!isActive}
                          aria-label={`Open search image ${index + 1} of ${visibleImages.length}${isActive ? " (current)" : ""}`}
                          tabIndex={isActive ? 0 : -1}
                        >
                          <SmoothImage
                            src={url}
                            alt={`Search result ${index + 1}`}
                            thumbnail
                            draggable={false}
                            className="h-full w-full"
                            imageClassName="h-full w-full object-cover transition-transform duration-500 ease-out motion-reduce:transition-none group-hover:scale-[1.025]"
                            onError={() => handleImageError(url)}
                          />
                          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent px-3 pb-3 pt-10 text-xs font-medium text-white opacity-0 transition-opacity duration-200 motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100">
                            Open full size
                          </span>
                          </button>
                        </motion.div>
                      </motion.div>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-2 text-center text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground/75 sm:hidden">
              Swipe
            </p>
          </div>
        </div>
      )}
    </div>
    <ImageModal isOpen={selectedImage !== null} onClose={() => setSelectedImage(null)} imageUrl={selectedImage || ""} alt="Search result" />
    </>
  );
}
