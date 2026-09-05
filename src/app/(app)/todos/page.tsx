"use client";

import Link from "next/link";
import { ArrowUpRight, CalendarClock, CheckCircle2, CircleAlert, GraduationCap, MapPin } from "lucide-react";
import type { Exam, Grade } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/use-api";
import { isPassed } from "@/lib/gpa";
import { examCountdown, formatScore, fullDateCN } from "@/lib/format";
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

function latestResult(grade: Grade): number | string {
  return grade.retakeScore ?? grade.makeupScore ?? grade.score;
}

function isSpecialExam(exam: Exam): boolean {
  return /补考|重修|缓考/.test(`${exam.category ?? ""}${exam.status ?? ""}`);
}

function unresolvedGrades(grades: Grade[]): Grade[] {
  const grouped = new Map<string, Grade[]>();
  grades.forEach((grade) => {
    const key = grade.courseCode || grade.courseName;
    grouped.set(key, [...(grouped.get(key) ?? []), grade]);
  });
  return [...grouped.values()].flatMap((attempts) => {
    if (attempts.some((grade) => isPassed(latestResult(grade)))) return [];
    return [
      [...attempts].sort((a, b) => b.semesterId.localeCompare(a.semesterId))[0],
    ];
  });
}

export default function TodosPage() {
  const { data, loading, error } = useApi(
    () => Promise.all([api.getGrades(), api.getExams()]).then(([grades, exams]) => ({ grades, exams })),
    [],
  );

  if (loading) return <TodosSkeleton />;
  if (error) return <ErrorState message={error.message} />;

  const grades = data?.grades ?? [];
  const exams = (data?.exams ?? [])
    .filter((exam) => exam.date >= todayIso())
    .sort((a, b) => a.date.localeCompare(b.date));
  const pendingCourses = unresolvedGrades(grades);
  const specialExams = exams.filter(isSpecialExam);
  const regularExams = exams.filter((exam) => !isSpecialExam(exam));
  const total = pendingCourses.length + exams.length;

  return (
    <div>
      <PageHeader title="学业待办" description="需要留意的课程与考试" />

      <div className="stagger-enter grid gap-4 sm:grid-cols-3">
        <SummaryCard icon={CircleAlert} label="待关注课程" value={pendingCourses.length} tone="warning" />
        <SummaryCard icon={GraduationCap} label="补考与重修" value={specialExams.length} tone="primary" />
        <SummaryCard icon={CalendarClock} label="近期考试" value={exams.length} tone="primary" />
      </div>

      {total === 0 ? (
        <Card className="mt-5"><CardContent className="pt-6"><EmptyState title="暂时没有待办" description="有新安排时会显示在这里" /></CardContent></Card>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">补考与重修</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link href="/grades">查看成绩 <ArrowUpRight /></Link></Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {specialExams.map((exam) => <ExamTodo key={exam.id} exam={exam} />)}
              {pendingCourses.map((grade) => (
                <div key={grade.id} className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 transition-transform duration-200 hover:-translate-y-0.5">
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="font-medium">{grade.courseName}</div><div className="mt-1 text-xs text-muted-foreground">{grade.semesterName}</div></div>
                    <Badge variant="warning">{formatScore(latestResult(grade))}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">尚未通过，请留意学校后续补考或重修通知。</p>
                </div>
              ))}
              {specialExams.length === 0 && pendingCourses.length === 0 && <EmptyState title="暂无补考或重修事项" />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">近期考试</CardTitle>
              <Button asChild variant="ghost" size="sm"><Link href="/exams">全部考试 <ArrowUpRight /></Link></Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {regularExams.length ? regularExams.map((exam) => <ExamTodo key={exam.id} exam={exam} />) : <EmptyState title="暂无其他考试安排" />}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mt-5 flex items-start gap-3 rounded-2xl border bg-card/60 p-4 text-sm text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        <p>只有学校已经发布的考试才会显示为安排；未通过课程仅作为关注提示。</p>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: typeof CircleAlert; label: string; value: number; tone: "warning" | "primary" }) {
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
        <Badge variant={isSpecialExam(exam) ? "warning" : "secondary"}>{exam.category || countdown.text}</Badge>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{exam.location || "地点待定"}</div>
    </div>
  );
}

function TodosSkeleton() {
  return <div className="space-y-5"><Skeleton className="h-10 w-48" /><div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-80" /></div>;
}
