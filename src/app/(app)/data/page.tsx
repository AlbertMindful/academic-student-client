"use client";

import * as React from "react";
import { ChevronDown, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { useRequireAuth } from "@/hooks/use-session";
import { useAcademicCenter } from "@/hooks/use-academic-center";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChaoxingConnect } from "@/components/chaoxing-connect";

const formatter = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export default function DataPage() {
  const { profile } = useRequireAuth();
  const { cache, syncing, sync } = useAcademicCenter(profile?.studentId);
  const [showRecords, setShowRecords] = React.useState(false);
  const payload = cache?.payload;
  return (
    <div className="mx-auto max-w-3xl pb-16">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight">数据与同步</h1><p className="mt-1 text-sm text-muted-foreground">查看来源状态与整理结果；不会显示登录凭证或会话信息。</p></div>
        <Button variant="outline" size="sm" onClick={() => void sync()} disabled={syncing}><RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />更新</Button>
      </div>
      <section className="space-y-1">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">信息来源</h2>
        {(payload?.providers ?? []).map((provider) => <div key={provider.provider} className="flex items-center gap-3 border-b border-border/60 py-3.5 last:border-0"><span className={cn("h-2 w-2 rounded-full", provider.status === "ok" ? "bg-emerald-500" : provider.status === "not_connected" ? "bg-muted-foreground/40" : "bg-amber-500")} /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{provider.label}</div><div className="mt-0.5 text-xs text-muted-foreground">{provider.message}{provider.lastSuccessAt ? ` · 最近成功 ${formatter.format(new Date(provider.lastSuccessAt))}` : ""}</div></div>{provider.provider === "chaoxing" ? <ChaoxingConnect onConnected={() => void sync()} /> : <Badge variant="outline">{provider.status === "ok" ? "正常" : "部分可用"}</Badge>}</div>)}
      </section>
      <section className="mt-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">本地数据</h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">{Object.entries(payload?.diagnostics.counts ?? {}).map(([name, count]) => <div key={name} className="bg-background p-4"><div className="text-xl font-semibold tabular-nums">{count}</div><div className="mt-1 text-xs text-muted-foreground">{name === "courses" ? "课程" : name === "exams" ? "考试" : name === "grades" ? "成绩" : name === "chaoxingCourses" ? "学习通课程" : "整理后事件"}</div></div>)}</div>
        <div className="mt-4 flex items-start gap-3 rounded-lg bg-muted/60 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>学业数据与已读、完成、忽略、置顶状态保存在当前设备。即使服务暂时不可用，也会继续显示最近一次成功同步的内容。</span></div>
      </section>
      <section className="mt-10">
        <button className="flex w-full items-center justify-between border-b py-3 text-left" onClick={() => setShowRecords((value) => !value)}><span className="inline-flex items-center gap-2 text-sm font-medium"><Database className="h-4 w-4 text-muted-foreground" />整理记录</span><ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showRecords && "rotate-180")} /></button>
        {showRecords && <div className="mt-3 max-h-[32rem] overflow-auto rounded-lg bg-muted/60 p-3"><pre className="whitespace-pre-wrap break-all text-[11px] leading-5 text-muted-foreground">{JSON.stringify((payload?.events ?? []).map(({ sources, ...event }) => ({ ...event, sources: sources.map((source) => ({ provider: source.provider, providerLabel: source.providerLabel, sourceId: source.sourceId, url: source.url })) })), null, 2)}</pre></div>}
      </section>
    </div>
  );
}
