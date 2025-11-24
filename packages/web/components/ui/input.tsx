import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "flex w-full rounded-[calc(var(--radius)+4px)] border border-border/60 bg-background/80 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_10px_30px_rgba(15,23,42,0.06)] ring-offset-background transition-all duration-[var(--transition-fast,160ms)] ease-[var(--ease-standard,cubic-bezier(0.4,0,0.2,1))] placeholder:text-muted-foreground/80 focus-visible:border-transparent focus-visible:bg-background focus-visible:shadow-[0_10px_26px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 file:border-0 file:bg-transparent file:text-sm file:font-medium",
  {
    variants: {
      density: {
        compact: "h-10 px-3",
        comfortable: "h-12 px-4 text-sm",
        spacious: "h-14 px-5 text-base",
      },
    },
    defaultVariants: {
      density: "comfortable",
    },
  }
)

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> &
  VariantProps<typeof inputVariants>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, density, type = "text", ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ density }), className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input, inputVariants }
