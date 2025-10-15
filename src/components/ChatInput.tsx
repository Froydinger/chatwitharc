import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Paperclip, Plus, ArrowRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { AIService } from "@/services/ai";
import { supabase } from "@/integrations/supabase/client";
import { detectMemoryCommand, addToMemoryBank, formatMemoryConfirmation } from "@/utils/memoryDetection";

/* ---------------- Helpers ---------------- */
function isImageEditRequest(message: string): boolean {
  if (!message) return false;
  const keywords = [
    "edit","modify","change","alter","update","replace","retouch","remove","add","combine","merge","blend","compose",
    "make it","make this","turn this","convert","put","place","swap","substitute","adjust","tweak","transform",
  ];
  const lower = message.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}
function checkForImageRequest(message: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase().trim();
  if (/^(generate|create|make|draw|paint|design|render|produce|build)\s+(an?\s+)?(image|picture|photo|illustration|artwork|graphic)/i.test(m)) return true;
  if (/^(generate|create|make)\s+an?\s+image\s+of/i.test(m)) return true;
  if (/^(show\s+me|give\s+me|i\s+want|i\s+need)\s+(an?\s+)?(image|picture|photo)/i.test(m)) return true;
  const imageKeywords = [
    "generate image","create image","make image","draw","paint","illustrate","picture of","photo of","image of",
    "render","visualize","design","artwork","graphic",
  ];
  return imageKeywords.some((keyword) => m.includes(keyword));
}
function extractImagePrompt(message: string): string {
  let prompt = (message || "").trim();
  prompt = prompt.replace(/^(please\s+)?(?:can|could|would)\s+you\s+/i, "").trim();
  prompt = prompt
    .replace(/^(?:generate|create|make|draw|paint|design|render|produce|visualize|show\s+me|give\s+me)\s+(?:an?\s+)?(?:image|picture|photo|illustration|artwork|graphic)?\s*(?:of)?\s*/i,"")
    .trim();
  if (!prompt) prompt = message.trim();
  if (!/^(a|an|the)\s+/i.test(prompt) && !/^[A-Z]/.test(prompt)) prompt = `a ${prompt}`;
  return prompt;
}

/* ---------------- Tiny utilities ---------------- */
const useSafePortalRoot = () => {
  const [root
