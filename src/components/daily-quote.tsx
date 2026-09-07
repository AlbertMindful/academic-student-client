"use client";

import * as React from "react";
import { quoteForDate } from "@/lib/daily-quotes";
import { cn } from "@/lib/utils";

export function DailyQuote({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [quote, setQuote] = React.useState(() => quoteForDate());
  React.useEffect(() => {
    const timer = window.setInterval(() => setQuote(quoteForDate()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <figure className={cn(
      "animate-fade-in border-l-2 border-border/80 pl-3",
      compact && "border-l-0 pl-0 text-center",
      className,
    )} key={quote.text}>
      <blockquote className={cn(
        "text-pretty text-sm leading-6 text-muted-foreground",
        compact && "text-xs leading-5 text-muted-foreground/80",
      )}>{quote.text}</blockquote>
      <figcaption className="mt-0.5 text-[11px] tracking-wide text-muted-foreground/55">
        {quote.source}
      </figcaption>
    </figure>
  );
}
