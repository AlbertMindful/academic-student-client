"use client";

import * as React from "react";
import Link from "next/link";
import { AlarmClock, BookOpen, CalendarClock, Check, ChevronRight, CircleAlert, EyeOff, MoreHorizontal, Pin, RefreshCw, RotateCcw, WifiOff } from "lucide-react";
import type { AcademicEvent, AcademicEventState, ProviderHealth } from "@/lib/types";
import { scoreAcademicEvent } from "@/lib/academic-events";
import { useSession } from "@/hooks/use-session";
import { useAcademicCenter } from "@/hooks/use-academic-center";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const dayFormatter = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" });
const timeFormatter = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });

function localDateKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function eventAnchor(event: AcademicEvent): string | undefined { return event.dueAt ?? event.startsAt ?? event.dueOn ?? event.startsOn; }

function eventMeta(event: AcademicEvent): string {
  const anchor = eventAnchor(event);
  const dateLabel = event.dueAt || event.startsAt
    ? dateTimeFormatter.format(new Date(anchor!))
    : anchor ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short" }).format(new Date(`${anchor}T12:00:00`)) : undefined;
  return [dateLabel, event.location].filter(Boolean).join(" · ");
}

function iconFor(event: AcademicEvent) {
  if (event.kind === "exam") return CalendarClock;
  if (event.kind === "assignment") return AlarmClock;
  if (event.kind === "class" || event.kind === "schedule_change") return BookOpen;
  return CircleAlert;
}

function SourceHealth({ providers, syncing }: { providers: ProviderHealth[]; syncing: boolean }) {
  const unavailable = providers.filter((provider) => provider.status !== "ok");
  const healthyCount = providers.length - unavailable.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <span className={cn("h-1.5 w-1.5 rounded-full", unavailable.length ? "bg-amber-500" : "bg-emerald-500")} />
          {syncing ? "正在更新" : `${healthyCount}/${providers.length} 来源正常`}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-2">
        {providers.map((provider) => (
          <div key={provider.provider} className="flex items-start gap-3 rounded-md px-2 py-2.5">
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", provider.status === "ok" ? "bg-emerald-500" : provider.status === "not_connected" ? "bg-muted-foreground/40" : "bg-amber-500")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">{provider.label}</span><span className="text-[11px] text-muted-foreground">{provider.status === "ok" ? "正常" : provider.status === "not_connected" ? "未连接" : "需留意"}</span></div>
              <p className="mt-0.5 text-xs text-muted-foreground">{provider.message}</p>
              {provider.provider === "academic" && provider.status === "reauth_required" && <Link href="/login" className="mt-1 inline-block text-xs font-medium text-foreground underline underline-offset-2">重新连接</Link>}
            </div>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EventRow({ event, state, onOpen, onState }: { event: AcademicEvent; state?: AcademicEventState; onOpen: () => void; onState: (patch: Partial<Omit<AcademicEventState, "updatedAt">>) => void }) {
  const Icon = iconFor(event);
  const priority = scoreAcademicEvent(event);
  return (
    <div className={cn("group relative flex items-start gap-3 border-b border-border/60 py-3.5 last:border-0", state?.read && "text-muted-foreground")}>
      <button className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors", priority >= 75 ? "bg-red-500/10 text-red-600 dark:text-red-400" : event.kind === "exam" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground")} onClick={onOpen} aria-label={`查看${event.title}`}><Icon className="h-4 w-4" /></button>
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-sm font-medium text-foreground", state?.done && "line-through text-muted-foreground")}>{event.title}</span>
          {state?.pinned && <Pin className="h-3 w-3 shrink-0 fill-current text-primary" />}
          {!state?.read && event.kind !== "class" && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{eventMeta(event) || event.summary || "暂无更多时间信息"}</p>
        {event.summary && eventMeta(event) && <p className="mt-1 truncate text-xs text-muted-foreground/75">{event.summary}</p>}
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={state?.done ? "恢复" : "完成"} onClick={() => onState({ done: !state?.done, read: true })}>{state?.done ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="更多操作"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onState({ pinned: !state?.pinned })}><Pin className="h-4 w-4" />{state?.pinned ? "取消置顶" : "置顶"}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onState({ read: !state?.read })}><Check className="h-4 w-4" />{state?.read ? "标为未读" : "标为已读"}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onState({ ignored: true, read: true })}><EyeOff className="h-4 w-4" />忽略</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function EventSection({ title, hint, events, states, onOpen, onState, empty }: { title: string; hint?: string; events: AcademicEvent[]; states: Record<string, AcademicEventState>; onOpen: (event: AcademicEvent) => void; onState: (id: string, patch: Partial<Omit<AcademicEventState, "updatedAt">>) => void; empty?: string }) {
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between gap-4"><h2 className="text-[13px] font-semibold tracking-wide text-foreground">{title}</h2>{hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}</div>
      {events.length ? <div>{events.map((event) => <EventRow key={event.id} event={event} state={states[event.id]} onOpen={() => onOpen(event)} onState={(patch) => onState(event.id, patch)} />)}</div> : <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Check className="h-4 w-4 text-emerald-500" />{empty ?? "没有需要处理的事项"}</div>}
    </section>
  );
}

export default function DashboardPage() {
  const { profile } = useSession();
  const { cache, loadingCache, syncing, error, sync, setEventState } = useAcademicCenter();
  const [selected, setSelected] = React.useState<AcademicEvent | null>(null);
  const now = React.useMemo(() => new Date(), []);
  const today = localDateKey(now);

  const visible = (cache?.payload.events ?? []).filter((event) => !cache?.states[event.id]?.ignored && !cache?.states[event.id]?.done).map((event) => ({ ...event, priority: scoreAcademicEvent(event, now) })).sort((a, b) => Number(Boolean(cache?.states[b.id]?.pinned)) - Number(Boolean(cache?.states[a.id]?.pinned)) || b.priority - a.priority || (eventAnchor(a) ?? "").localeCompare(eventAnchor(b) ?? ""));
  const todayEvents = visible.filter((event) => event.startsAt && localDateKey(event.startsAt) === today && event.kind === "class").sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  const attention = visible.filter((event) => {
    if (event.kind === "class") return false;
    const anchor = eventAnchor(event);
    const days = anchor ? (new Date(anchor).getTime() - now.getTime()) / 86_400_000 : null;
    return cache?.states[event.id]?.pinned || event.kind === "schedule_change" || (days != null && days >= -0.2 && days <= 7) || !cache?.states[event.id]?.read;
  }).slice(0, 8);
  const future = visible.filter((event) => event.kind !== "class" && !attention.some((item) => item.id === event.id) && Boolean(eventAnchor(event))).sort((a, b) => (eventAnchor(a) ?? "").localeCompare(eventAnchor(b) ?? "")).slice(0, 7);

  if (loadingCache && !cache) return <DashboardLoading />;
  if (!cache) return <div className="mx-auto max-w-xl py-24 text-center"><WifiOff className="mx-auto h-6 w-6 text-muted-foreground" /><h1 className="mt-4 text-lg font-semibold">暂时无法取得学业信息</h1><p className="mt-2 text-sm text-muted-foreground">{error?.message ?? "请检查网络后重试。"}</p><Button className="mt-5" onClick={() => void sync()}>重新尝试</Button></div>;

  const payload = cache.payload;
  const noAttention = attention.length === 0;
  return (
    <div className="mx-auto max-w-5xl pb-16">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm text-muted-foreground">{dayFormatter.format(now)}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">{noAttention ? "今天没有什么需要特别处理" : `${profile?.name ?? "你"}，今天有 ${attention.length} 件事值得留意`}</h1>{payload.teachingWeek && <p className="mt-2 text-xs text-muted-foreground">第 {payload.teachingWeek.current} 教学周</p>}</div>
        <div className="flex items-center gap-1"><SourceHealth providers={payload.providers} syncing={syncing} /><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => void sync()} disabled={syncing} aria-label="立即更新"><RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} /></Button></div>
      </header>
      {error && <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-700 dark:text-amber-300"><WifiOff className="h-3.5 w-3.5" />{error.code === "SESSION_EXPIRED" ? <>教务系统登录已过期，当前仍显示上次结果。<Link href="/login" className="font-medium underline underline-offset-2">重新登录</Link></> : "更新失败，已保留并显示上次结果。"}</div>}
      <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,.8fr)]">
        <div className="space-y-10">
          <EventSection title="需要注意" events={attention} states={cache.states} onOpen={setSelected} onState={setEventState} empty="今天没有临近截止、考试或未读的重要变化" />
          <EventSection title="今天" hint={`${todayEvents.length} 个安排`} events={todayEvents} states={cache.states} onOpen={setSelected} onState={setEventState} empty="今天没有课程安排" />
        </div>
        <aside className="space-y-8 lg:border-l lg:border-border/60 lg:pl-8">
          <EventSection title="接下来" events={future} states={cache.states} onOpen={setSelected} onState={setEventState} empty="未来几天很安静" />
          <div className="border-t border-border/60 pt-5 text-xs text-muted-foreground"><div className="flex items-center justify-between gap-3"><span>上次更新 {timeFormatter.format(new Date(payload.syncedAt))}</span><Link href="/activity" className="inline-flex items-center gap-0.5 transition-colors hover:text-foreground">所有动态 <ChevronRight className="h-3 w-3" /></Link></div></div>
        </aside>
      </div>
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">{selected && <><DialogHeader><DialogTitle>{selected.title}</DialogTitle><DialogDescription>{eventMeta(selected) || "学校暂未提供明确时间"}</DialogDescription></DialogHeader>{selected.summary && <p className="text-sm leading-6">{selected.summary}</p>}{selected.conflicts?.length ? <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs leading-5 text-amber-800 dark:text-amber-200"><div className="font-medium">来源信息存在差异，已采用教务系统数据</div>{selected.conflicts.map((conflict) => <div key={conflict.field} className="mt-1 opacity-80">{conflict.field === "date" ? "日期" : conflict.field === "time" ? "时间" : conflict.field === "location" ? "地点" : "状态"}：教务系统 {conflict.academicValue ?? "未提供"}；其他来源 {conflict.otherValue ?? "未提供"}</div>)}</div> : null}<div className="space-y-2 border-t pt-4"><div className="text-xs font-medium text-muted-foreground">来源</div><div className="flex flex-wrap gap-2">{selected.sources.map((source) => <Badge key={`${source.provider}:${source.sourceId}`} variant="secondary">{source.providerLabel}</Badge>)}</div>{selected.merge && <p className="text-xs text-muted-foreground">{selected.merge.reason}（{Math.round(selected.merge.confidence * 100)}%）</p>}</div></>}</DialogContent>
      </Dialog>
    </div>
  );
}

function DashboardLoading() {
  return <div className="mx-auto max-w-5xl space-y-8"><div className="space-y-3"><Skeleton className="h-4 w-36" /><Skeleton className="h-8 w-80" /></div><div className="grid gap-12 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,.8fr)]"><div className="space-y-3">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div><div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)}</div></div></div>;
}
