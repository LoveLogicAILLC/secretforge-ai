import React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

function cn(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref
) {
  const base =
    "block w-full rounded-md border border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent";
  const padding = "h-10 px-3";
  return <input ref={ref} className={cn(base, padding, className)} {...props} />;
});
