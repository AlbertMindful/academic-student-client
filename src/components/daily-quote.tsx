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
    <p className={cn(
      "animate-fade-in text-pretty text-sm leading-6 text-muted-foreground",
      compact && "text-xs leading-5 text-muted-foreground/80",
      className,
    )} key={quote.text}>
      <span>“{quote.text}”</span>
      <span className="ml-2 whitespace-nowrap text-muted-foreground/65">— {quote.source}</span>
    </p>
  );
}
