import { Children, cloneElement, isValidElement, useLayoutEffect, useRef, type ReactElement, type ReactNode } from 'react';

/** History mounts without motion. Only newly inserted eligible rows fade;
 * assistant prose owns its reveal and streamed finals must never replay it. */
export function ChatMessageRows({ children }: {children:ReactNode}) {
  const previous = useRef<Set<string> | null>(null);
  const revealed = useRef(new Set<string>());
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<{
    className?:string; 'data-row-reveal'?:boolean;
  }>[];
  const enters = new Set(rows.filter(row=>revealed.current.has(String(row.key)) ||
    (previous.current && !previous.current.has(String(row.key)) && row.props['data-row-reveal'])).map(row=>String(row.key)));
  useLayoutEffect(()=>{previous.current=new Set(rows.map(row=>String(row.key)));revealed.current=enters;});
  return <>{rows.map(row=>cloneElement(row, {
    className:[row.props.className, enters.has(String(row.key)) ? 'arc-chat-row-enter' : ''].filter(Boolean).join(' '),
  }))}</>;
}
