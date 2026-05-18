import { initializePaddle, type Paddle } from "@paddle/paddle-js";

let paddleInstance: Paddle | undefined;
let initPromise: Promise<Paddle | undefined> | null = null;

const isProd = import.meta.env.PROD;
const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
const environment: "sandbox" | "production" = isProd ? "production" : "sandbox";

export async function getPaddle(): Promise<Paddle | undefined> {
  if (paddleInstance) return paddleInstance;
  if (!clientToken) {
    console.error("[paddle] VITE_PAYMENTS_CLIENT_TOKEN is missing");
    return undefined;
  }
  if (!initPromise) {
    initPromise = initializePaddle({ environment, token: clientToken }).then((p) => {
      paddleInstance = p;
      return p;
    });
  }
  return initPromise;
}

export const PADDLE_PRO_PRICE_ID = "arcai_pro_monthly";
