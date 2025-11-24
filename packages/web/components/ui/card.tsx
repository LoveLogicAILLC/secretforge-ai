import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const cardVariants = cva(
  "group relative rounded-[calc(var(--radius)+10px)] border bg-card/95 text-card-foreground transition-all duration-[var(--transition-medium,220ms)] ease-[var(--ease-emphasized,cubic-bezier(0.16,1,0.3,1))] shadow-[0_18px_55px_rgba(15,23,42,0.08)]",
  {
    variants: {
      variant: {
        base: "",
        elevated:
          "border-transparent bg-gradient-to-br from-card via-neutral-50 to-white shadow-[0_25px_65px_rgba(15,23,42,0.14)] hover:-translate-y-1 hover:shadow-[0_35px_95px_rgba(15,23,42,0.18)]",
        featured:
          "border-transparent bg-gradient-to-br from-primary via-primary-soft to-accent-strong/85 text-primary-foreground shadow-[0_35px_85px_rgba(67,56,202,0.45)]",
      },
      interactive: {
        true: "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:-translate-y-1 hover:shadow-[0_30px_90px_rgba(15,23,42,0.16)]",
        false: "",
      },
    },
    defaultVariants: {
      variant: "base",
      interactive: false,
    },
  }
)

type CardVariantProps = Omit<VariantProps<typeof cardVariants>, "interactive">

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    CardVariantProps {
  interactive?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, interactive = false, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        cardVariants({
          variant,
          interactive: interactive ? "true" : "false",
        }),
        className
      )}
      {...props}
    />
  )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col gap-2 border-b border-border/60 px-8 py-6 text-left",
      className
    )}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-xl font-semibold leading-tight tracking-[-0.02em]",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground/90", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("px-8 pb-8 pt-6 text-base text-foreground/90", className)}
    {...props}
  />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex flex-col gap-3 border-t border-border/60 px-8 pb-7 pt-5 sm:flex-row sm:items-center sm:justify-between",
      className
    )}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  cardVariants,
}
