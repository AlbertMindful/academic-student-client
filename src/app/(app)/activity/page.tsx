"use client";

import * as React from "react";
import { Check, EyeOff, Inbox, Pin, RotateCcw } from "lucide-react";
import type { AcademicEvent } from "@/lib/types";
import { useAcademicCenter } from "@/hooks/use-academic-center";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { isCurrentAcademicEvent, isHistoricalAcademicEvent } from "@/lib/event-visibility";

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

export default function ActivityPage() {
  const { cache, loadingCache, setEventState } = useAcademicCenter();
  const [filter, setFilter] = React.useState<"current" | "done" | "ignored" | "history">("current");
  if (loadingCache && !cache) return <div className="space-y-3"><Skeleton className="h-8 w-40" />{Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-16" />)}</div>;

  const now = Date.now();
  const events = [...(cache?.payload.events ?? [])].filter((event) => {
    const state = cache?.states[event.id];
    const currentSemesterId = cache?.payload.currentSemester?.id;
    if (filter === "current") return isCurrentAcademicEvent(event, state, currentSemesterId, now);
    if (filter === "done") return state?.done;
    if (filter === "ignored") return state?.ignored;
    return isHistoricalAcademicEvent(event, state, currentSemesterId, now);
  }).sort((a, b) => filter === "current"
    ? (a.dueAt ?? a.startsAt ?? a.dueOn ?? a.startsOn ?? a.updatedAt).localeCompare(b.dueAt ?? b.startsAt ?? b.dueOn ?? b.startsOn ?? b.updatedAt)
    : (b.startsAt ?? b.publishedAt ?? b.updatedAt).localeCompare(a.startsAt ?? a.publishedAt ?? a.updatedAt));

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <div className="mb-7"><h1 className="text-2xl font-semibold tracking-tight">所有动态</h1><p className="mt-1 text-sm text-muted-foreground">默认只显示仍值得关注的内容，较早的信息会自动移入历史。</p></div>
      <div className="mb-5 flex gap-1 border-b pb-3">
        {(["current", "done", "ignored", "history"] as const).map((value) => <Button key={value} size="sm" variant={filter === value ? "secondary" : "ghost"} onClick={() => setFilter(value)}>{value === "current" ? "当前" : value === "done" ? "已完成" : value === "ignored" ? "已忽略" : "历史"}</Button>)}
      </div>
      {events.length ? <div>{events.map((event) => {
        const state = cache?.states[event.id];
        const anchor = event.dueAt ?? event.startsAt ?? event.dueOn ?? event.startsOn ?? event.publishedAt;
        return <div key={event.id} className={cn("group flex items-start gap-3 border-b border-border/60 py-4", (state?.done || state?.ignored) && "opacity-60")}>
          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={cn("text-sm font-medium", state?.done && "line-through")}>{event.title}</span><Badge variant="outline" className="h-5 text-[10px] font-normal">{labels[event.kind]}</Badge>{state?.pinned && <Pin className="h-3 w-3 fill-current text-primary" />}</div><p className="mt-1 text-xs text-muted-foreground">{[anchor ? (event.dueAt || event.startsAt || event.publishedAt ? formatter.format(new Date(anchor)) : anchor) : undefined, event.location, event.contextLabel, event.courseName].filter(Boolean).join(" · ")}</p>{event.summary && <p className="mt-1.5 text-sm text-muted-foreground">{event.summary}</p>}</div>
          <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={state?.done ? "恢复" : "完成"} onClick={() => setEventState(event.id, { done: !state?.done, ignored: false, read: true })}>{state?.done ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}</Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={state?.ignored ? "恢复" : "忽略"} onClick={() => setEventState(event.id, { ignored: !state?.ignored, done: false, read: true })}>{state?.ignored ? <RotateCcw className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</Button>
          </div>
        </div>;
      })}</div> : <div className="flex flex-col items-center py-24 text-center text-muted-foreground"><Inbox className="h-6 w-6" /><p className="mt-3 text-sm">这里还没有内容</p></div>}
    </div>
  );
}
