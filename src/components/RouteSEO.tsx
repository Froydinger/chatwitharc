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
      "ArcAI is free forever with every model, unlimited voice, Deep Search, shared chats and web publishing. Image generation and editing include 20 outputs per account per UTC day.",
  },
  "/downloads": {
    title: "ArcAI • Downloads",
    description:
      "ArcAI native downloads are coming soon. Use the supported web app in your browser or install it to your home screen or dock.",
  },
  "/dashboard": {
    title: "ArcAI • Dashboard",
    description:
      "Your ArcAI hub: chats, canvases, images, deploys, music and memory all in one place.",
  },
  "/dashboard/settings": {
    title: "ArcAI • Settings",
    description:
      "Manage your ArcAI account, accent color, voice, memory and usage preferences.",
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
  "/upgrade": {
    title: "ArcAI • Upgrade to Boost",
    description:
      "Upgrade your ArcAI account to Boost for unlimited premium reasoning, unlimited voice mode, custom web publishing, and higher image quotas.",
  },
  "/share": {
    title: "ArcAI • Shared Conversation",
    description:
      "Read this shared ArcAI conversation with reasoning, search, and coding context.",
  },
  "/tasks": {
    title: "ArcAI • Tasks",
    description:
      "View and manage your scheduled reminder tasks and automated actions.",
  },
  "/shared": {
    title: "ArcAI • Shared Rooms",
    description:
      "View and collaborate in shared project workspaces and chat rooms.",
  },
  "/checkout/return": {
    title: "ArcAI • Checkout Completed",
    description:
      "Thank you for upgrading to ArcAI Boost. Your subscription features are ready.",
  },
  "/build": {
    title: "ArcAI • App Builder Coming Soon",
    description:
      "The App Builder IDE is paused while the workspace is rebuilt.",
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
  if (path.startsWith("/share/")) {
    path = "/share";
  }
  if (path.startsWith("/shared/")) {
    path = "/shared";
  }
  if (path.startsWith("/build")) {
    path = "/build";
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
