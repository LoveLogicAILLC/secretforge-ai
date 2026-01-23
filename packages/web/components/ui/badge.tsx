import React from "react";

function cn(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1 text-xs font-medium text-slate-300",
        className
      )}
      {...props}
    />
  );
}
