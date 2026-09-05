"use client";

import { CalendarClock, History, MapPin, Armchair } from "lucide-react";
import type { Exam } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { examCountdown, fullDateCN } from "@/lib/format";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function ExamsPage() {
  const { data, loading, error } = useApi(() => api.getExams(), []);

  if (loading) return <ExamsSkeleton />;
  if (error) return <ErrorState message={error.message} />;

  const exams = data ?? [];
  const today = todayIso();
  const upcoming = exams
    .filter((e) => e.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const history = exams
    .filter((e) => e.date < today)
    .sort((a, b) => (a.date > b.date ? -1 : 1));

  return (
    <div>
      <PageHeader
        title="考试"
        description="查看考试时间、地点与倒计时"
      />

      <div className="space-y-8">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <CalendarClock className="h-4 w-4" />
            即将考试
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState title="暂无即将到来的考试" />
          ) : (
            <ExamList exams={upcoming} />
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <History className="h-4 w-4" />
            历史考试
          </h2>
          {history.length === 0 ? (
            <EmptyState title="暂无历史考试记录" />
          ) : (
            <ExamList exams={history} />
          )}
        </section>
      </div>
    </div>
  );
}

function ExamList({ exams }: { exams: Exam[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {exams.map((exam) => {
        const cd = examCountdown(exam.date);
        return (
          <Card key={exam.id} className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base">{exam.courseName}</CardTitle>
                  {exam.category && (
                    <Badge variant={/补考|重修/.test(exam.category) ? "warning" : "secondary"} className="mt-2">
                      {exam.category}
                    </Badge>
                  )}
                </div>
                <Badge variant={cd.tone === "soon" ? "warning" : cd.tone === "upcoming" ? "secondary" : "outline"}>
                  {cd.text}
                </Badge>
              </div>
              {exam.status && <div className="pt-1 text-xs">{exam.status}</div>}
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm text-muted-foreground">
              <div>{fullDateCN(exam.date)}</div>
              {exam.startTime && (
                <div>
                  {exam.startTime}
                  {exam.endTime ? ` - ${exam.endTime}` : ""}
                </div>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {exam.location || "未注明"}
                </span>
                {exam.seatNumber && (
                  <span className="inline-flex items-center gap-1">
                    <Armchair className="h-3.5 w-3.5" />
                    座位 {exam.seatNumber}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ExamsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
