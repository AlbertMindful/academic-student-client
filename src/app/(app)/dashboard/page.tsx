"use client";

import {
  CalendarDays,
  ClipboardList,
  Clock,
  GraduationCap,
  Layers,
  MapPin,
  User,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatToday, teachingWeekLabel } from "@/lib/teaching-week";
import { gpaLabel, shortDateCN, weekdayCN } from "@/lib/format";

export default function DashboardPage() {
  const { data, loading, error } = useApi(() => api.getDashboard(), []);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message={error.message} />;
  if (!data) return null;

  const { profile, teachingWeek, nextClass, todayClasses, upcomingExams, gpa } =
    data;

  return (
    <div>
      <PageHeader
        title={`你好，${profile.name}`}
        description={formatToday(new Date())}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={gpaLabel(gpa.source)}
          value={gpa.value != null ? gpa.value.toFixed(2) : "—"}
          hint={gpa.source === "computed" ? "根据学校绩点汇总" : undefined}
          icon={GraduationCap}
        />
        <StatCard
          label="已修学分"
          value={gpa.earnedCredits}
          hint={`总学分 ${gpa.totalCredits}`}
          icon={Layers}
        />
        <StatCard
          label="当前教学周"
          value={
            teachingWeek ? teachingWeekLabel(teachingWeek.current) : "—"
          }
          hint={teachingWeek ? `自 ${shortDateCN(teachingWeek.startDate)}` : undefined}
          icon={CalendarDays}
        />
        <StatCard
          label="今日课程"
          value={todayClasses.length}
          hint="节"
          icon={Clock}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* 下一节课 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">下一节课</CardTitle>
            <CardDescription>根据当前教学周与单双周自动计算</CardDescription>
          </CardHeader>
          <CardContent>
            {nextClass ? (
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-xl font-semibold tracking-tight">
                      {nextClass.course.courseName}
                    </h3>
                    <Badge variant="secondary" className="shrink-0">
                      {weekdayCN(new Date(nextClass.startAt))}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {nextClass.session.startTime} - {nextClass.session.endTime}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {nextClass.session.location}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {nextClass.course.teacher}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm text-muted-foreground">距离开始</div>
                  <div className="mt-0.5 text-lg font-semibold text-primary">
                    {nextClass.countdownText}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                title="本周没有后续课程"
                description="好好休息一下吧"
              />
            )}
          </CardContent>
        </Card>

        {/* 最近考试 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              最近考试
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingExams.length === 0 ? (
              <EmptyState title="暂无即将到来的考试" />
            ) : (
              upcomingExams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {exam.courseName}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {shortDateCN(exam.date)}
                      {exam.startTime ? ` · ${exam.startTime}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {exam.location}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* 今日课程 */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">今日课程</CardTitle>
          <CardDescription>
            {teachingWeek ? teachingWeekLabel(teachingWeek.current) : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {todayClasses.length === 0 ? (
            <EmptyState title="今天没有课" />
          ) : (
            <div className="divide-y">
              {todayClasses.map((course) => {
                const session = course.sessions[0];
                return (
                  <div
                    key={course.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {course.courseName}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {session.startTime} - {session.endTime} ·{" "}
                        {session.location} · {course.teacher}
                      </div>
                    </div>
                    <Badge variant="outline">{course.weeks}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-40 lg:col-span-2" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-40" />
    </div>
  );
}
