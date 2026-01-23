import React from "react";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
};

function cn(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "md", ...props },
  ref
) {
  const base =
    "inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
    default: "bg-purple-600 text-white hover:bg-purple-700",
    ghost: "bg-transparent hover:bg-slate-800/50",
    outline: "border border-slate-700 bg-transparent hover:bg-slate-800/50",
  };
  const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4",
    lg: "h-12 px-6 text-lg",
  };

  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
});
