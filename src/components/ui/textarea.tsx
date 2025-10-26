import * as React from "react"

import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&.landing-textarea]:!border-0 [&.landing-textarea]:!ring-0 [&.landing-textarea]:!outline-0 [&.landing-textarea]:!shadow-none [&.landing-textarea:focus-visible]:!ring-0 [&.landing-textarea:focus-visible]:!ring-offset-0 [&.landing-textarea:focus]:!border-0 [&.landing-textarea:focus]:!outline-0 [&.landing-textarea:focus]:!shadow-none [&.landing-textarea:focus-visible]:!outline-0",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
