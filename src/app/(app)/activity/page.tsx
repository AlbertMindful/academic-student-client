"use client";

import * as React from "react";
import { Check, EyeOff, Inbox, Pin, RotateCcw } from "lucide-react";
import type { AcademicEvent } from "@/lib/types";
import { useAcademicCenter } from "@/hooks/use-academic-center";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { isCompletedAcademicEvent, isCurrentAcademicEvent, isHistoricalAcademicEvent } from "@/lib/event-visibility";
import { DailyQuote } from "@/components/daily-quote";

const labels: Record<AcademicEvent["kind"], string> = {
  class: "课程",
  schedule_change: "课程变化",
  assignment: "作业",
  exam: "考试",
  grade: "成绩",
  notice: "通知",
  material: "资料",
};

const formatter = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

function eventLabel(event: AcademicEvent): string {
  if (
    event.kind === "exam"
    && event.sources.some((source) => source.provider === "chaoxing")
    && !event.sources.some((source) => source.provider === "academic")
  ) return "线上考试";
  return labels[event.kind];
}

export default function ActivityPage() {
  const { cache, loadingCache, setEventState } = useAcademicCenter();
  const [filter, setFilter] = React.useState<"current" | "done" | "ignored" | "history">("current");
  if (loadingCache && !cache) return <div className="space-y-3"><Skeleton className="h-8 w-40" />{Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div>;

  const now = Date.now();
  const events = [...(cache?.payload.events ?? [])].filter((event) => {
    if (event.kind === "class") return false;
    const state = cache?.states[event.id];
    const currentSemesterId = cache?.payload.currentSemester?.id;
    if (filter === "current") return isCurrentAcademicEvent(event, state, currentSemesterId, now);
    if (filter === "done") return isCompletedAcademicEvent(event, state);
    if (filter === "ignored") return state?.ignored;
    return isHistoricalAcademicEvent(event, state, currentSemesterId, now);
  }).sort((a, b) => filter === "current"
    ? (a.dueAt ?? a.startsAt ?? a.dueOn ?? a.startsOn ?? a.updatedAt).localeCompare(b.dueAt ?? b.startsAt ?? b.dueOn ?? b.startsOn ?? b.updatedAt)
    : (b.startsAt ?? b.publishedAt ?? b.updatedAt).localeCompare(a.startsAt ?? a.publishedAt ?? a.updatedAt));

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <div className="mb-7"><h1 className="text-2xl font-semibold tracking-tight">所有动态</h1></div>
      <div className="activity-filter-tabs mb-5 grid grid-cols-4 gap-1 border-b pb-3 sm:flex">
        {(["current", "done", "ignored", "history"] as const).map((value) => <Button key={value} size="sm" className="px-2" variant={filter === value ? "secondary" : "ghost"} onClick={() => setFilter(value)}>{value === "current" ? "当前" : value === "done" ? "已完成" : value === "ignored" ? "已忽略" : "历史"}</Button>)}
      </div>
      {events.length ? <div>{events.map((event) => {
        const state = cache?.states[event.id];
        const completed = isCompletedAcademicEvent(event, state);
        const anchor = event.dueAt ?? event.startsAt ?? event.dueOn ?? event.startsOn ?? event.publishedAt;
        return <div key={event.id} className={cn("group flex min-w-0 items-start gap-3 border-b border-border/60 py-4", (completed || state?.ignored) && "opacity-60")}>
          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><span className={cn("min-w-0 break-words text-sm font-medium", completed && "line-through")}>{event.title}</span><Badge variant="outline" className="h-5 shrink-0 text-[10px] font-normal">{eventLabel(event)}</Badge>{state?.pinned && <Pin className="h-3 w-3 shrink-0 fill-current text-primary" />}</div>
            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{[anchor ? (event.dueAt || event.startsAt || event.publishedAt ? formatter.format(new Date(anchor)) : anchor) : undefined, event.location, event.contextLabel, event.courseName, event.sender ? `来自 ${event.sender}` : undefined].filter(Boolean).join(" · ")}</p>
            {event.summary && <p className="mt-1.5 whitespace-pre-line break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{event.summary}</p>}
            <div className="activity-mobile-actions mt-3 flex flex-wrap items-center gap-1 sm:hidden">
              {!completed && <Button size="sm" variant="ghost" className="h-9 px-2.5" onClick={() => setEventState(event.id, { done: true, ignored: false, read: true })}><Check className="h-4 w-4" />完成</Button>}
              {state?.done && <Button size="sm" variant="ghost" className="h-9 px-2.5" onClick={() => setEventState(event.id, { done: false, read: true })}><RotateCcw className="h-4 w-4" />恢复</Button>}
              <Button size="sm" variant="ghost" className="h-9 px-2.5" onClick={() => setEventState(event.id, { ignored: !state?.ignored, done: false, read: true })}>{state?.ignored ? <RotateCcw className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{state?.ignored ? "恢复" : "忽略"}</Button>
            </div>
          </div>
          <div className="activity-desktop-actions hidden shrink-0 gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 sm:flex">
            {!completed && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="完成" onClick={() => setEventState(event.id, { done: true, ignored: false, read: true })}><Check className="h-3.5 w-3.5" /></Button>}
            {state?.done && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="恢复" onClick={() => setEventState(event.id, { done: false, read: true })}><RotateCcw className="h-3.5 w-3.5" /></Button>}
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={state?.ignored ? "恢复" : "忽略"} onClick={() => setEventState(event.id, { ignored: !state?.ignored, done: false, read: true })}>{state?.ignored ? <RotateCcw className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</Button>
          </div>
        </div>;
      })}</div> : <div className="flex flex-col items-center py-24 text-center text-muted-foreground"><Inbox className="h-6 w-6" /><DailyQuote compact className="mt-3 max-w-md" /></div>}
    </div>
  );
}
