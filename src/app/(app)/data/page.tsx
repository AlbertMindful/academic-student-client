"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { useAcademicCenter } from "@/hooks/use-academic-center";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChaoxingConnect } from "@/components/chaoxing-connect";

const formatter = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const countLabels: Record<string, string> = {
  courses: "教务课程",
  exams: "教务考试",
  grades: "成绩",
  events: "整理后事项",
  chaoxingCourses: "匹配课程",
  chaoxingInbox: "收件箱",
  chaoxingActivities: "课程动态",
  chaoxingAssignments: "未完成作业",
  chaoxingOnlineExams: "线上考试",
};

export default function DataPage() {
  const { cache, syncing, sync } = useAcademicCenter();
  const [showRecords, setShowRecords] = React.useState(false);
  const payload = cache?.payload;
  return (
    <div className="mx-auto max-w-3xl pb-16">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-semibold tracking-tight">数据来源</h1><p className="mt-1 text-sm text-muted-foreground">管理教务系统和学习通的连接状态。</p></div>
        <Button variant="outline" size="sm" onClick={() => void sync()} disabled={syncing}><RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />更新</Button>
      </div>
      <section className="space-y-1">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">信息来源</h2>
        {(payload?.providers ?? []).map((provider) => <div key={provider.provider} className="flex items-center gap-3 border-b border-border/60 py-3.5 last:border-0"><span className={cn("h-2 w-2 rounded-full", provider.status === "ok" ? "bg-emerald-500" : provider.status === "not_connected" ? "bg-muted-foreground/40" : "bg-amber-500")} /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{provider.label}</div><div className="mt-0.5 text-xs text-muted-foreground">{provider.message}{provider.lastSuccessAt ? ` · 最近成功 ${formatter.format(new Date(provider.lastSuccessAt))}` : ""}</div></div>{provider.provider === "chaoxing" ? <ChaoxingConnect requiresReconnect={provider.status === "reauth_required"} onConnected={() => void sync()} /> : provider.status === "ok" ? <Badge variant="outline">正常</Badge> : <Button asChild variant="outline" size="sm"><Link href="/login">重新连接</Link></Button>}</div>)}
      </section>
      <section className="mt-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">本地数据</h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">{Object.entries(payload?.diagnostics.counts ?? {}).map(([name, count]) => <div key={name} className="bg-background p-4"><div className="text-xl font-semibold tabular-nums">{count}</div><div className="mt-1 text-xs text-muted-foreground">{countLabels[name] ?? name}</div></div>)}</div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">课程以教务系统为准。学习通课程内容只保留与当前课表可靠匹配的部分；统一考试入口中仍有效的考试会单独保留。</p>
        <div className="mt-4 flex items-start gap-3 rounded-lg bg-muted/60 p-3 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>学业数据与已读、完成、忽略、置顶状态保存在当前设备。即使服务暂时不可用，也会继续显示最近一次成功同步的内容。</span></div>
      </section>
      <section className="mt-10">
        <button className="flex w-full items-center justify-between border-b py-3 text-left" onClick={() => setShowRecords((value) => !value)}><span className="inline-flex items-center gap-2 text-sm font-medium"><Database className="h-4 w-4 text-muted-foreground" />整理记录</span><ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showRecords && "rotate-180")} /></button>
        {showRecords && <div className="mt-3 max-h-[32rem] overflow-auto rounded-lg bg-muted/60 p-3"><pre className="whitespace-pre-wrap break-all text-[11px] leading-5 text-muted-foreground">{JSON.stringify((payload?.events ?? []).map(({ sources, ...event }) => ({ ...event, sources: sources.map((source) => ({ provider: source.provider, providerLabel: source.providerLabel, sourceId: source.sourceId, url: source.url })) })), null, 2)}</pre></div>}
      </section>
    </div>
  );
}
