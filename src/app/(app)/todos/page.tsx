"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarClock, CheckCircle2, GraduationCap, MapPin } from "lucide-react";
import type { Exam } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/use-api";
import { isOfficialMakeupExam, isOfficialSpecialExam } from "@/lib/exams";
import { examCountdown, fullDateCN } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function todayIso(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function TodosPage() {
  const { data, loading, error } = useApi(() => api.getExams(), []);

  if (loading) return <TodosSkeleton />;
  if (error) return <ErrorState message={error.message} />;

  const exams = (data ?? [])
    .filter((exam) => exam.date >= todayIso())
    .sort((a, b) => a.date.localeCompare(b.date));
  const makeupExams = exams.filter(isOfficialMakeupExam);
  const otherSpecialExams = exams.filter(
    (exam) => !isOfficialMakeupExam(exam) && isOfficialSpecialExam(exam),
  );
  const regularExams = exams.filter((exam) => !isOfficialSpecialExam(exam));

  return (
    <div>
      <PageHeader title="考试待办" description="学校已经发布的考试安排" />

      <div className="stagger-enter grid gap-4 sm:grid-cols-3">
        <SummaryCard icon={GraduationCap} label="补考安排" value={makeupExams.length} tone="warning" />
        <SummaryCard icon={CheckCircle2} label="重修与缓考" value={otherSpecialExams.length} tone="primary" />
        <SummaryCard icon={CalendarClock} label="全部待考" value={exams.length} tone="primary" />
      </div>

      {exams.length === 0 ? (
        <Card className="mt-5"><CardContent className="pt-6"><EmptyState title="暂时没有待办" description="有新安排时会显示在这里" /></CardContent></Card>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">补考安排</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link href="/exams">全部考试 <ArrowUpRight /></Link></Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {makeupExams.length ? makeupExams.map((exam) => <ExamTodo key={exam.id} exam={exam} />) : <EmptyState title="暂无学校发布的补考安排" />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">近期考试</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link href="/exams">全部考试 <ArrowUpRight /></Link></Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {[...otherSpecialExams, ...regularExams].length ? [...otherSpecialExams, ...regularExams].sort((a, b) => a.date.localeCompare(b.date)).map((exam) => <ExamTodo key={exam.id} exam={exam} />) : <EmptyState title="暂无其他考试安排" />}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mt-5 flex items-start gap-3 rounded-2xl border bg-card/60 p-4 text-sm text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        <p>这里只展示学校明确发布的考试安排，不根据成绩推测是否通过或是否需要补考。</p>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: typeof CalendarClock; label: string; value: number; tone: "warning" | "primary" }) {
  return (
    <Card className="overflow-hidden"><CardContent className="flex items-center justify-between p-5">
      <div><div className="text-2xl font-semibold tracking-tight">{value}</div><div className="mt-1 text-sm text-muted-foreground">{label}</div></div>
      <span className={tone === "warning" ? "rounded-xl bg-amber-500/10 p-2.5 text-amber-600 dark:text-amber-400" : "rounded-xl bg-primary/10 p-2.5 text-primary"}><Icon className="h-5 w-5" /></span>
    </CardContent></Card>
  );
}

function ExamTodo({ exam }: { exam: Exam }) {
  const countdown = examCountdown(exam.date);
  return (
    <div className="rounded-xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="truncate font-medium">{exam.courseName}</div><div className="mt-1 text-xs text-muted-foreground">{fullDateCN(exam.date)}{exam.startTime ? ` · ${exam.startTime}` : ""}</div></div>
        <Badge variant={isOfficialSpecialExam(exam) ? "warning" : "secondary"}>{exam.category || countdown.text}</Badge>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{exam.location || "地点待定"}</div>
    </div>
  );
}

function TodosSkeleton() {
  return <div className="space-y-5"><Skeleton className="h-10 w-48" /><div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-80" /></div>;
}
