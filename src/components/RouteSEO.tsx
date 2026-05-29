import { useLocation, useParams } from "react-router-dom";
import { SEO } from "./SEO";

interface RouteMeta {
  title: string;
  description: string;
}

const ROUTE_META: Record<string, RouteMeta> = {
  "/": {
    title: "ArcAI — Ask, Reflect, Create",
    description:
      "Talk to Arc, generate images, write code and prose in one place. Free multimodal AI with realtime voice.",
  },
  "/pricing": {
    title: "Pricing — ArcAI · Free forever, Boost $7/mo",
    description:
      "ArcAI is free forever. Optional ArcAi Boost ($7/mo) unlocks unlimited image generations, unlimited voice conversations, and one-tap web publishing for your code creations.",
  },
  "/downloads": {
    title: "Download ArcAI for Mac, Windows & iOS",
    description:
      "Get ArcAI on every device. Download the desktop and mobile apps for realtime voice, images and chat.",
  },
  "/dashboard": {
    title: "Dashboard — ArcAI",
    description:
      "Your ArcAI hub: chats, canvases, images, deploys, music and memory all in one place.",
  },
  "/dashboard/settings": {
    title: "Settings — ArcAI",
    description:
      "Manage your ArcAI account, accent color, voice, memory and subscription preferences.",
  },
  "/support": {
    title: "Support — ArcAI",
    description:
      "Open a ticket or get help with ArcAI. Real humans, fast replies, no runaround.",
  },
  "/admin": {
    title: "Admin — ArcAI",
    description: "ArcAI admin tools.",
  },
  "/unsubscribe": {
    title: "Unsubscribe — ArcAI",
    description: "Manage email preferences for ArcAI.",
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

  const meta =
    ROUTE_META[path] ??
    ROUTE_META[location.pathname] ??
    (path === "/chat"
      ? {
          title: "Chat — ArcAI",
          description:
            "Continue your ArcAI conversation with memory, voice and creative tools.",
        }
      : {
          title: "ArcAI — Ask, Reflect, Create",
          description:
            "Talk to Arc, generate images, write code and prose in one place. Free multimodal AI with realtime voice.",
        });

  return <SEO title={meta.title} description={meta.description} path={path} />;
};
