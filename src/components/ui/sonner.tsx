import { useTheme } from "next-themes"
import { Toaster as Sonner, toast } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      duration={3000}
      toastOptions={{
        classNames: {
          toast:
            "group toast glass-strong !rounded-full !border-border/40 !shadow-2xl !shadow-primary/10 !px-4 !py-3 !min-w-[280px] !max-w-[380px] group-[.toaster]:text-foreground hover:!glass-glow transition-all duration-200",
          description: "group-[.toast]:text-muted-foreground !text-xs !leading-tight",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground !rounded-full !px-3 !py-1.5 !text-xs",
          cancelButton:
            "group-[.toast]:bg-muted/50 group-[.toast]:text-muted-foreground !rounded-full !px-3 !py-1.5 !text-xs",
          closeButton:
            "!bg-transparent !border-0 !text-foreground/60 hover:!text-foreground hover:!bg-muted/30 !rounded-full !w-7 !h-7",
          success: "!border-success/50 !shadow-success/20",
          error: "!border-destructive/50 !shadow-destructive/20",
          warning: "!border-warning/50 !shadow-warning/20",
          info: "!border-primary/50 !shadow-primary/20",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
