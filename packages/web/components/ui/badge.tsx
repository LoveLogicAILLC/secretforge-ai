import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[var(--radius-pill,40px)] border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] transition-all duration-[var(--transition-fast,160ms)] ease-[var(--ease-standard,cubic-bezier(0.4,0,0.2,1))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/90 text-primary-foreground shadow-[0_4px_15px_rgba(59,130,246,0.35)]",
        secondary:
          "border-transparent bg-secondary/80 text-secondary-foreground shadow-[0_3px_10px_rgba(15,23,42,0.12)]",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-[0_4px_15px_rgba(190,18,60,0.35)]",
        outline:
          "border-border/70 bg-transparent text-foreground hover:border-border/40 hover:bg-border/10",
        success:
          "border-transparent bg-emerald-500/20 text-emerald-900 dark:text-emerald-100",
        info: "border-transparent bg-sky-500/20 text-sky-900 dark:text-sky-100",
        warning:
          "border-transparent bg-amber-400/25 text-amber-900 dark:text-amber-100",
        neutral:
          "border-border/50 bg-neutral-100/60 text-foreground dark:bg-neutral-200/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
