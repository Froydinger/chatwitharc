import { isValidElement, useLayoutEffect, useRef, type ReactElement } from "react";
import { Transition, type TransitionPreset } from "./Transition";

/** Keep the last committed element for its CSS exit. The parent still guards
 * JSX with its original condition, so closing cannot evaluate cleared data. */
export function ConditionalTransition({ children, preset = "fade", delay = 0 }: {
  children: ReactElement | false | null | undefined | "";
  preset?: TransitionPreset;
  delay?: number;
}) {
  const previous = useRef<ReactElement | null>(null);
  const current = isValidElement(children) ? children : null;
  useLayoutEffect(() => { if (current) previous.current = current; }, [current]);
  const element = current ?? previous.current;
  return element ? <Transition show={current !== null} preset={preset} delay={delay}>{element}</Transition> : null;
}
