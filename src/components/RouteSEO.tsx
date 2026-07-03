import { useLocation, useParams } from "react-router-dom";
import { SEO } from "./SEO";

interface RouteMeta {
  title: string;
  description: string;
}

const ROUTE_META: Record<string, RouteMeta> = {
  "/": {
    title: "ArcAI • Ask, Reflect, Create",
    description:
      "Talk to Arc, generate images, write code and prose in one place. Free multimodal AI with realtime voice.",
  },
  "/pricing": {
    title: "ArcAI • Pricing",
    description:
      "ArcAI is free forever. Upgrade via ArcAI Boost ($7/mo) for unlimited image generations, unlimited voice conversations, and one-tap web publishing for your code creations.",
  },
  "/downloads": {
    title: "ArcAI • Downloads",
    description:
      "Get ArcAI on every device. Download the desktop and mobile apps for realtime voice, images and chat.",
  },
  "/dashboard": {
    title: "ArcAI • Dashboard",
    description:
      "Your ArcAI hub: chats, canvases, images, deploys, music and memory all in one place.",
  },
  "/dashboard/settings": {
    title: "ArcAI • Settings",
    description:
      "Manage your ArcAI account, accent color, voice, memory and subscription preferences.",
  },
  "/support": {
    title: "ArcAI • Support",
    description:
      "Open a ticket or get help with ArcAI. Real humans, fast replies, no runaround.",
  },
  "/admin": {
    title: "ArcAI • Admin",
    description: "ArcAI admin tools.",
  },
  "/unsubscribe": {
    title: "ArcAI • Unsubscribe",
    description: "Manage email preferences for ArcAI.",
  },
  "/terms": {
    title: "ArcAI • Terms",
    description: "ArcAI terms of service and refund policy.",
  },
  "/privacy": {
    title: "ArcAI • Privacy",
    description: "ArcAI privacy policy.",
  },
  "/welcome": {
    title: "ArcAI — Free AI Assistant with Voice, Images & Memory",
    description:
      "ArcAI is a free multimodal AI assistant with real-time voice, image generation, code and long-term memory. A free ChatGPT, Gemini and Claude alternative.",
  },
  "/blog": {
    title: "ArcAI Guides & FAQs — Free AI Assistant",
    description:
      "Guides and FAQs about ArcAI, the free AI assistant with voice, image generation, code and memory.",
  },
};

export const RouteSEO = () => {
  const location = useLocation();
  const params = useParams();
  let path = location.pathname;

  // Normalize dynamic chat routes to a canonical /chat path
  if (path.startsWith("/chat/")) {
    path = "/chat";
  }

  // Let per-post <Helmet> in BlogPostPage own SEO for /blog/:slug.
  if (path.startsWith("/blog/")) {
    return null;
  }

  const meta =
    ROUTE_META[path] ??
    ROUTE_META[location.pathname] ??
    (path === "/chat"
      ? {
          title: "ArcAI • Chat",
          description:
            "Continue your ArcAI conversation with memory, voice and creative tools.",
        }
      : {
          title: "ArcAI • Page Not Found",
          description:
            "Talk to Arc, generate images, write code and prose in one place. Free multimodal AI with realtime voice.",
        });

  return <SEO title={meta.title} description={meta.description} path={path} />;
};
