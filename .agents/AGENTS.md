# Project Rules for ChatWithArc

## Stripe Payments Integration
* **Checkout Mode**: Always use the **Stripe Hosted Checkout redirection flow** (redirecting via `window.location.href = data.url`) rather than embedded checkout dialog components like `@stripe/react-stripe-js`. The hosted checkout page is robust, natively handles promotion codes, and avoids mobile iframe render issues.
* **Type-Safe Checkout Triggers**: When invoking `openCheckout` from UI components, ensure that React event objects (such as `SyntheticEvent`) are not accidentally passed as the `priceId` parameter. Always wrap the trigger in a parameterless anonymous arrow function (e.g., `onClick={() => openCheckout()}`) or pass a strict string literal. The `openCheckout` method should also sanitize the input parameter to filter out non-string objects before building the Supabase JSON payload to avoid circular serialization errors (`JSON.stringify cannot serialize cyclic structures`).
