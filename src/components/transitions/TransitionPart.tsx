import type { ReactElement } from "react";
import { Slot } from "@radix-ui/react-slot";

/** A modal card follows its retaining ancestor's open/close lifecycle. */
export function TransitionPart({ children }: { children: ReactElement }) {
  return <Slot className="arc-transition-part">{children}</Slot>;
}
