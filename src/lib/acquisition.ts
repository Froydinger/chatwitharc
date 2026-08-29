/**
 * First-touch acquisition capture.
 *
 * The referrer is only available on the visit that brought someone in — by the
 * time they finish signing up, several navigations have wiped it. So it is
 * stashed on the first page view and read back at onboarding.
 *
 * Stored in localStorage rather than sent anywhere: nothing leaves the device
 * unless an account is actually created.
 */

const STORAGE_KEY = "arc_first_touch";

export interface FirstTouch {
  referrer: string;
  landingPath: string;
  at: number;
}

/** Referrers worth naming, so the raw host does not have to be interpreted later. */
const KNOWN_SOURCES: Array<{ match: RegExp; source: string }> = [
  { match: /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/i, source: "chatgpt" },
  { match: /(^|\.)perplexity\.ai$/i, source: "perplexity" },
  { match: /(^|\.)claude\.ai$/i, source: "claude" },
  { match: /(^|\.)gemini\.google\.com$|(^|\.)bard\.google\.com$/i, source: "gemini" },
  { match: /(^|\.)google\./i, source: "google" },
  { match: /(^|\.)bing\.com$|(^|\.)duckduckgo\.com$/i, source: "search" },
  { match: /(^|\.)reddit\.com$|(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)tiktok\.com$|(^|\.)instagram\.com$|(^|\.)facebook\.com$|(^|\.)threads\.net$/i, source: "social" },
];

export function inferSourceFromReferrer(referrer: string): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname;
    for (const { match, source } of KNOWN_SOURCES) {
      if (match.test(host)) return source;
    }
    return null;
  } catch {
    return null;
  }
}

/** Call once at startup, before routing can replace the URL. */
export function captureFirstTouch() {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;

    const referrer = document.referrer || "";
    // Ignore our own navigations — only an outside referrer is interesting.
    if (referrer) {
      try {
        if (new URL(referrer).hostname === window.location.hostname) return;
      } catch {
        /* keep a referrer we cannot parse; it is still evidence */
      }
    }

    const search = window.location.search || "";
    const payload: FirstTouch = {
      referrer,
      landingPath: `${window.location.pathname}${search}`,
      at: Date.now(),
    };

    // A visit with neither a referrer nor a campaign tag tells us nothing.
    if (!referrer && !/[?&](utm_|ref=)/i.test(search)) return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode or blocked storage — acquisition data is never worth an error */
  }
}

export function readFirstTouch(): FirstTouch | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FirstTouch) : null;
  } catch {
    return null;
  }
}
