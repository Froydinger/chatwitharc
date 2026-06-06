import { useEffect, useRef, useState } from "react";

interface MermaidDiagramProps {
  chart: string;
}

// The app toggles a `light`/`dark` class on <html>; default (no class) is dark.
function useIsDark() {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && !document.documentElement.classList.contains("light"),
  );
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setIsDark(!el.classList.contains("light"));
    const obs = new MutationObserver(update);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    update();
    return () => obs.disconnect();
  }, []);
  return isDark;
}

// Lazy singleton so the (large) mermaid bundle is only pulled in when a diagram
// actually appears.
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => mermaid);
  }
  return mermaidPromise;
}

let diagramSeq = 0;

/**
 * Renders a ```mermaid code block as an SVG diagram. While the answer is still
 * streaming the source is often incomplete/invalid — in that case (or on any
 * parse error) we gracefully fall back to showing the raw code instead of an
 * error box, and re-render once the source becomes valid.
 */
export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const isDark = useIsDark();
  const [svg, setSvg] = useState<string>("");
  const [failed, setFailed] = useState(false);
  const idRef = useRef(`mermaid-${++diagramSeq}`);

  useEffect(() => {
    let cancelled = false;
    const source = chart.trim();
    if (!source) {
      setSvg("");
      setFailed(false);
      return;
    }

    // Debounce so we don't try to parse every partial frame mid-stream.
    const timer = setTimeout(async () => {
      try {
        const mermaid = await getMermaid();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: isDark ? "dark" : "default",
          fontFamily: "inherit",
        });
        // parse() throws on invalid/incomplete source without touching the DOM.
        await mermaid.parse(source);
        const { svg: rendered } = await mermaid.render(`${idRef.current}-${++diagramSeq}`, source);
        if (!cancelled) {
          setSvg(rendered);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chart, isDark]);

  // Not yet renderable (still streaming or invalid): show the source as a code block.
  if (failed || !svg) {
    return (
      <pre className="my-3 overflow-x-auto rounded-lg border border-border/50 bg-muted/40 p-3 text-sm">
        <code className="font-mono text-foreground/80">{chart.trim()}</code>
      </pre>
    );
  }

  return (
    <div
      className="my-3 flex justify-center overflow-x-auto rounded-lg border border-border/50 bg-background/40 p-3 [&_svg]:max-w-full [&_svg]:h-auto"
      // Mermaid output is sanitized (securityLevel: 'strict').
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
