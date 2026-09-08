"use client";

import * as React from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarPlus,
  Check,
  Clock3,
  Copy,
  Gauge,
  Lightbulb,
  Sparkles,
  Target,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/use-api";
import { computeGpa } from "@/lib/gpa";
import {
  DAY_NAMES,
  academicCalendarFile,
  findFreeWindows,
  requiredGpa,
  upcomingExams,
  weeklyLoad,
} from "@/lib/academic-insights";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function InsightsPage() {
  const { data, loading, error } = useApi(async () => {
    const [schedule, grades, exams, semesters] = await Promise.all([
      api.getSchedule(),
      api.getGrades(),
      api.getExams(),
      api.getSemesters(),
    ]);
    return { schedule, grades, exams, semesters };
  }, []);
  const [plannedCredits, setPlannedCredits] = React.useState(20);
  const [target, setTarget] = React.useState(3.5);
  const [copied, setCopied] = React.useState(false);

  if (loading) return <InsightsSkeleton />;
  if (error) return <ErrorState message={error.message} />;
  if (!data) return null;

  const allSchedule = data.schedule;
  const load = weeklyLoad(allSchedule);
  const maxLoad = Math.max(...load, 1);
  const totalSections = load.reduce((sum, value) => sum + value, 0);
  const busiestIndex = load.indexOf(Math.max(...load));
  const freeWindows = findFreeWindows(allSchedule);
  const nextExams = upcomingExams(data.exams);
  const allExams = data.exams;
  const currentSemester = data.semesters.find((semester) => semester.isCurrent) ?? data.semesters[0];
  const gpa = computeGpa(data.grades, null);
  const needed = gpa.value == null
    ? null
    : requiredGpa(gpa.value, gpa.totalCredits, plannedCredits, target);
  const feasible = needed != null && needed <= 4 && needed >= 0;

  function downloadCalendar() {
    if (!currentSemester) return;
    const blob = new Blob(
      [academicCalendarFile(allSchedule, allExams, currentSemester.startDate)],
      { type: "text/calendar;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "我的学业日历.ics";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyFreeTime() {
    const text = freeWindows.slice(0, 5).map((item) => `${item.day} ${item.label}`).join("、");
    await navigator.clipboard.writeText(`我本周的空闲时间：${text}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div>
      <PageHeader
        title="学业洞察"
        description="把课表、成绩和考试变成可执行的安排"
        action={<Badge variant="secondary" className="gap-1.5 px-3 py-1.5"><Sparkles className="h-3.5 w-3.5" />实时分析</Badge>}
      />

      <div className="stagger-enter grid gap-4 md:grid-cols-3">
        <InsightStat icon={Clock3} label="本周课堂负荷" value={`${totalSections} 节`} detail={`${DAY_NAMES[busiestIndex]}最忙 · ${maxLoad} 节`} />
        <InsightStat icon={BookOpenCheck} label="成绩记录" value={`${data.grades.length} 门`} detail="仅展示学校返回的成绩" tone="green" />
        <InsightStat icon={CalendarPlus} label="近期考试" value={`${nextExams.length} 场`} detail={nextExams[0] ? `下一场 · ${nextExams[0].courseName}` : "暂无考试安排"} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.12fr_.88fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-base">一周节奏</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">按每天上课节数统计，快速找到轻重节奏</p>
            </div>
            <span className="rounded-xl bg-primary/10 p-2 text-primary"><Gauge className="h-4 w-4" /></span>
          </CardHeader>
          <CardContent>
            <div className="flex h-44 items-end justify-between gap-3 rounded-2xl bg-muted/50 px-4 pb-3 pt-6">
              {load.map((value, index) => (
                <div key={DAY_NAMES[index]} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-xs font-medium tabular-nums">{value}</span>
                  <div className="relative w-full max-w-10 flex-1 overflow-hidden rounded-full bg-background">
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-full bg-gradient-to-t from-primary to-violet-400 transition-[height] duration-700 ease-out"
                      style={{ height: `${Math.max(8, (value / maxLoad) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground">{DAY_NAMES[index].slice(1)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-base">空闲时间发现</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">自动筛选工作日连续 2 节以上的空档</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void copyFreeTime()} disabled={!freeWindows.length}>
              {copied ? <Check /> : <Copy />}{copied ? "已复制" : "复制"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {freeWindows.slice(0, 5).map((item, index) => (
              <div key={`${item.day}-${item.label}`} className="flex items-center justify-between rounded-xl border border-border/70 bg-background/60 px-3 py-2.5 transition-transform hover:translate-x-0.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                  <div><div className="text-sm font-medium">{item.day}</div><div className="text-xs text-muted-foreground">第 {item.startSection}–{item.endSection} 节</div></div>
                </div>
                <span className="text-sm tabular-nums text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4 text-primary" />目标 GPA 试算</CardTitle>
              <Badge variant={feasible ? "success" : "warning"}>{feasible ? "目标可达" : "目标偏高"}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-violet-400/5 p-5">
              <div className="flex items-baseline justify-between gap-4">
                <div><p className="text-xs text-muted-foreground">下阶段所需平均绩点</p><p className="mt-1 text-3xl font-semibold tracking-[-0.04em]">{needed == null ? "—" : Math.max(0, needed).toFixed(2)}</p></div>
                <div className="text-right text-xs text-muted-foreground">当前 {gpa.value?.toFixed(2) ?? "—"}<ArrowRight className="mx-1 inline h-3 w-3" />目标 {target.toFixed(2)}</div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <label className="text-xs text-muted-foreground">目标 GPA<Input className="mt-1.5 bg-background/80" type="number" min="0" max="4" step="0.1" value={target} onChange={(event) => setTarget(Number(event.target.value))} /></label>
                <label className="text-xs text-muted-foreground">计划修读学分<Input className="mt-1.5 bg-background/80" type="number" min="1" max="50" value={plannedCredits} onChange={(event) => setPlannedCredits(Math.max(1, Number(event.target.value)))} /></label>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">结果仅供学业规划参考，以最终成绩单为准。</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4 text-amber-500" />行动建议</CardTitle>
            <Button variant="outline" size="sm" onClick={downloadCalendar} disabled={!data.semesters.length || (!data.schedule.length && !allExams.length)}><CalendarPlus />导出学业日历</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <ActionRow icon={BookOpenCheck} title="成绩记录已同步" detail="成绩只按学校原始结果展示，不判断是否通过" />
            <ActionRow icon={Clock3} title={`${DAY_NAMES[busiestIndex]}减少额外安排`} detail={`当天有 ${maxLoad} 节课，建议把深度学习放到轻课日`} />
            <ActionRow icon={CalendarPlus} title={nextExams[0] ? `为「${nextExams[0].courseName}」建立复习计划` : "课程和考试可以带走"} detail={nextExams[0] ? `${nextExams[0].date} · ${nextExams[0].location || "地点待定"}` : "导出后可一次加入手机或电脑日历"} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InsightStat({ icon: Icon, label, value, detail, tone = "violet" }: { icon: React.ElementType; label: string; value: string; detail: string; tone?: "violet" | "amber" | "green" }) {
  const tones = { violet: "bg-primary/10 text-primary", amber: "bg-amber-500/12 text-amber-600 dark:text-amber-400", green: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" };
  return <Card className="group p-5 hover:-translate-y-0.5"><div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-[-0.035em]">{value}</p></div><span className={`rounded-xl p-2.5 ${tones[tone]}`}><Icon className="h-4 w-4" /></span></div><p className="mt-2 truncate text-xs text-muted-foreground">{detail}</p></Card>;
}

function ActionRow({ icon: Icon, title, detail }: { icon: React.ElementType; title: string; detail: string }) {
  return <div className="flex gap-3 rounded-xl border border-border/70 p-3"><span className="mt-0.5 rounded-lg bg-muted p-2"><Icon className="h-4 w-4 text-muted-foreground" /></span><div className="min-w-0"><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p></div></div>;
}

function InsightsSkeleton() {
  return <div className="space-y-5"><Skeleton className="h-10 w-52" /><div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28" />)}</div><div className="grid gap-5 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div></div>;
}
