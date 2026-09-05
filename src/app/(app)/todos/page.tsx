"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarClock, CheckCircle2, MapPin } from "lucide-react";
import type { Exam } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/use-api";
import { isOfficialSpecialExam } from "@/lib/exams";
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
  const soonExams = exams.filter((exam) => ["今天", "明天"].includes(examCountdown(exam.date).text));
  const locatedExams = exams.filter((exam) => Boolean(exam.location));

  return (
    <div>
      <PageHeader title="考试待办" description="学校已经发布的考试安排" />

      <div className="stagger-enter grid gap-4 sm:grid-cols-3">
        <SummaryCard icon={CalendarClock} label="今明两天" value={soonExams.length} tone="warning" />
        <SummaryCard icon={CheckCircle2} label="地点已公布" value={locatedExams.length} tone="primary" />
        <SummaryCard icon={CalendarClock} label="全部待考" value={exams.length} tone="primary" />
      </div>

      {exams.length === 0 ? (
        <Card className="mt-5"><CardContent className="pt-6"><EmptyState title="暂时没有待办" description="有新安排时会显示在这里" /></CardContent></Card>
      ) : (
        <div className="mt-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">待考安排</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link href="/exams">全部考试 <ArrowUpRight /></Link></Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {exams.map((exam) => <ExamTodo key={exam.id} exam={exam} />)}
            </CardContent>
          </Card>
        </div>
      )}
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
