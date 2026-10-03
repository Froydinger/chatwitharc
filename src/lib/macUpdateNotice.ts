export function needsSignedMacUpdate(userAgent: string): boolean {
  return /Macintosh/i.test(userAgent) && /ArcAIInternalAuth\//i.test(userAgent)
    && /(?:^|\s)ArcAI\/5\.2\.1(?:\s|$)/i.test(userAgent);
}
