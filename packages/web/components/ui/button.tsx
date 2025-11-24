import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap border border-transparent font-semibold tracking-tight ring-offset-background transition-all duration-[var(--transition-medium,220ms)] ease-[var(--ease-emphasized,cubic-bezier(0.16,1,0.3,1))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "rounded-[calc(var(--radius)+6px)] bg-gradient-to-br from-primary via-primary-soft to-primary/80 text-primary-foreground shadow-[0_10px_25px_rgba(15,23,42,0.12)] hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(15,23,42,0.16)] active:translate-y-0 active:shadow-[0_8px_18px_rgba(15,23,42,0.14)]",
        destructive:
          "rounded-[calc(var(--radius)+6px)] bg-destructive text-destructive-foreground shadow-[0_10px_25px_rgba(190,18,60,0.25)] hover:bg-destructive/90 hover:-translate-y-0.5",
        outline:
          "rounded-[calc(var(--radius)+6px)] border-border/70 bg-background/80 text-foreground shadow-none hover:border-foreground/40 hover:bg-foreground/5",
        secondary:
          "rounded-[calc(var(--radius)+6px)] bg-secondary text-secondary-foreground shadow-[0_4px_18px_rgba(15,23,42,0.08)] hover:bg-secondary/80",
        tonal:
          "rounded-[calc(var(--radius)+6px)] bg-primary/10 text-primary shadow-none hover:bg-primary/15",
        subtle:
          "rounded-[calc(var(--radius)+6px)] border border-transparent bg-transparent text-foreground shadow-none hover:bg-neutral-100/40 dark:hover:bg-neutral-100/10",
        glow:
          "rounded-[calc(var(--radius)+8px)] bg-slate-900 text-white shadow-[0_25px_60px_rgba(15,23,42,0.55)] hover:shadow-[0_30px_75px_rgba(15,23,42,0.65)]",
        ghost:
          "rounded-[calc(var(--radius)+6px)] bg-transparent text-foreground shadow-none hover:bg-accent hover:text-accent-foreground",
        link: "rounded-none border-none bg-transparent p-0 text-primary underline-offset-4 shadow-none hover:underline focus-visible:ring-0",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-4 text-sm",
        lg: "h-12 px-7 text-base",
        icon: "h-11 w-11",
      },
      shape: {
        rounded: "",
        pill: "rounded-[var(--radius-pill,40px)] px-7",
      },
    },
    compoundVariants: [
      {
        variant: "subtle",
        shape: "pill",
        class:
          "border border-border/60 text-foreground hover:border-foreground/40",
      },
      {
        variant: "glow",
        shape: "pill",
        class: "px-8",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      shape: "rounded",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, shape, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, shape }), className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
