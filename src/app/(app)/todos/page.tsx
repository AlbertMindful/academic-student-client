"use client";

import * as React from "react";
import { AlarmClock, CalendarClock, Check, ExternalLink, RotateCcw } from "lucide-react";
import type { AcademicEvent } from "@/lib/types";
import { useAcademicCenter } from "@/hooks/use-academic-center";
import { isCompletedAcademicEvent, isCurrentAcademicEvent } from "@/lib/event-visibility";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DailyQuote } from "@/components/daily-quote";

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function eventMoment(event: AcademicEvent): string | undefined {
  return event.dueAt ?? event.startsAt ?? event.dueOn ?? event.startsOn;
}

function eventTimeLabel(event: AcademicEvent): string {
  const value = eventMoment(event);
  if (!value) return "未提供截止时间";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short" })
      .format(new Date(`${value}T12:00:00+08:00`));
  }
  return dateTimeFormatter.format(new Date(value));
}

function chaoxingSourceOrder(event: AcademicEvent): number | null {
  for (const source of event.sources) {
    if (source.provider !== "chaoxing" || !source.raw || typeof source.raw !== "object") continue;
    const sourceOrder = (source.raw as Record<string, unknown>).sourceOrder;
    if (typeof sourceOrder === "number" && Number.isFinite(sourceOrder)) return sourceOrder;
  }
  return null;
}

/** Keep each Chaoxing list in the same top-to-bottom order as the source page. */
function compareTaskOrder(a: AcademicEvent, b: AcademicEvent): number {
  const kindDifference = (a.kind === "assignment" ? 0 : 1) - (b.kind === "assignment" ? 0 : 1);
  if (kindDifference) return kindDifference;
  const aOrder = chaoxingSourceOrder(a);
  const bOrder = chaoxingSourceOrder(b);
  if (aOrder != null && bOrder != null && aOrder !== bOrder) return aOrder - bOrder;
  if (aOrder != null) return -1;
  if (bOrder != null) return 1;
  return (eventMoment(a) ?? a.updatedAt).localeCompare(eventMoment(b) ?? b.updatedAt);
}

export default function TodosPage() {
  const { cache, loadingCache, setEventState } = useAcademicCenter();
  const [view, setView] = React.useState<"active" | "done" | "history">("active");
  if (loadingCache && !cache) return <TodosSkeleton />;

  const now = Date.now();
  const currentSemesterId = cache?.payload.currentSemester?.id;
  const allTasks = (cache?.payload.events ?? [])
    .filter((event) => (event.kind === "assignment" || event.kind === "exam") && !cache?.states[event.id]?.ignored);
  const completedTasks = allTasks
    .filter((event) => isCompletedAcademicEvent(event, cache?.states[event.id]))
    .sort(compareTaskOrder);
  const activeTasks = allTasks
    .filter((event) => !isCompletedAcademicEvent(event, cache?.states[event.id])
      && isCurrentAcademicEvent(event, cache?.states[event.id], currentSemesterId, now))
    .sort(compareTaskOrder);
  const historyTasks = allTasks
    .filter((event) => !isCompletedAcademicEvent(event, cache?.states[event.id])
      && !isCurrentAcademicEvent(event, cache?.states[event.id], currentSemesterId, now))
    .sort(compareTaskOrder);
  const tasks = view === "active" ? activeTasks : view === "done" ? completedTasks : historyTasks;
  const assignments = allTasks.filter((event) => event.kind === "assignment").length;
  const exams = allTasks.length - assignments;
  const urgent = activeTasks.filter((event) => {
    const value = eventMoment(event);
    if (!value) return false;
    const timestamp = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59+08:00` : value);
    return timestamp >= now && timestamp - now <= 86_400_000;
  }).length;

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <div className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight">待办</h1>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span><strong className="mr-1 text-foreground">{assignments}</strong>项作业记录</span>
          <span><strong className="mr-1 text-foreground">{exams}</strong>场考试记录</span>
          {urgent > 0 && <span className="text-amber-600 dark:text-amber-400"><strong className="mr-1">{urgent}</strong>项在 24 小时内</span>}
        </div>
        <div className="mt-5 inline-flex rounded-lg bg-muted p-1">
          <button className={`rounded-md px-3 py-1.5 text-xs transition-colors ${view === "active" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setView("active")}>待处理 {activeTasks.length}</button>
          <button className={`rounded-md px-3 py-1.5 text-xs transition-colors ${view === "done" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setView("done")}>已完成 {completedTasks.length}</button>
          <button className={`rounded-md px-3 py-1.5 text-xs transition-colors ${view === "history" ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setView("history")}>历史记录 {historyTasks.length}</button>
        </div>
      </div>

      {tasks.length ? <div>{tasks.map((event) => {
        const sourceUrl = event.sources.find((source) => source.url)?.url;
        const Icon = event.kind === "assignment" ? AlarmClock : CalendarClock;
        const onlineExam = event.kind === "exam"
          && event.sources.some((source) => source.provider === "chaoxing")
          && !event.sources.some((source) => source.provider === "academic");
        return (
          <div key={event.id} className="group flex items-start gap-3 border-b border-border/60 py-4 last:border-0">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className={view === "done" ? "text-sm font-medium text-muted-foreground line-through" : "text-sm font-medium"}>{event.title}</span><Badge variant="outline" className="h-5 text-[10px] font-normal">{event.kind === "assignment" ? "作业" : onlineExam ? "线上考试" : "考试"}</Badge></div>
              <p className="mt-1 text-xs text-muted-foreground">{[eventTimeLabel(event), event.courseName, event.location, event.status].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {sourceUrl && <Button asChild size="icon" variant="ghost" className="h-8 w-8"><a href={sourceUrl} target="_blank" rel="noreferrer" aria-label="打开原页面"><ExternalLink className="h-3.5 w-3.5" /></a></Button>}
              {view === "active" && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="完成" onClick={() => setEventState(event.id, { done: true, read: true })}><Check className="h-3.5 w-3.5" /></Button>}
              {view === "done" && cache?.states[event.id]?.done && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="恢复为未完成" onClick={() => setEventState(event.id, { done: false, read: true })}><RotateCcw className="h-3.5 w-3.5" /></Button>}
            </div>
          </div>
        );
      })}</div> : <div className="flex flex-col items-center py-24 text-center text-muted-foreground"><Check className="h-6 w-6 text-emerald-500" /><DailyQuote compact className="mt-3 max-w-md" /></div>}
    </div>
  );
}

function TodosSkeleton() {
  return <div className="mx-auto max-w-4xl space-y-4"><Skeleton className="h-8 w-28" /><Skeleton className="h-4 w-72" />{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>;
}
