"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, MapPin, User } from "lucide-react";
import { api } from "@/lib/api-client";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScheduleGrid } from "@/components/schedule-grid";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { computeTeachingWeek, teachingWeekLabel } from "@/lib/teaching-week";
import { isoDayOfWeek } from "@/lib/schedule";
import type { CourseSchedule } from "@/lib/types";

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export default function SchedulePage() {
  const [semesterId, setSemesterId] = React.useState<string>("__current__");
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [selected, setSelected] = React.useState<CourseSchedule | null>(null);

  const semesters = useApi(() => api.getSemesters(), []);
  const schedule = useApi(
    () => api.getSchedule(semesterId === "__current__" ? undefined : semesterId),
    [semesterId],
  );

  const currentSemester =
    semesters.data?.find((s) => s.isCurrent) ?? semesters.data?.[0];
  const baseWeek = currentSemester?.startDate
    ? computeTeachingWeek(currentSemester.startDate, new Date())
    : 1;
  const viewingWeek = Math.max(1, baseWeek + weekOffset);

  if (semesters.loading || schedule.loading) return <ScheduleSkeleton />;
  if (semesters.error) return <ErrorState message={semesters.error.message} />;
  if (schedule.error) return <ErrorState message={schedule.error.message} />;

  const courses = schedule.data ?? [];

  return (
    <div>
      <PageHeader
        title="课表"
        description={
          currentSemester ? currentSemester.name : "查看每周课程安排"
        }
        action={
          <select
            value={semesterId}
            onChange={(e) => {
              setSemesterId(e.target.value);
              setWeekOffset(0);
            }}
            className="h-9 rounded-md border bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="__current__">当前学期</option>
            {(semesters.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekOffset((o) => o - 1)}
            disabled={viewingWeek <= 1}
            aria-label="上一周"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-24 text-center text-sm font-medium">
            {teachingWeekLabel(viewingWeek)}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekOffset((o) => o + 1)}
            aria-label="下一周"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
              回到本周
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">单周</Badge>
          <Badge variant="outline">双周</Badge>
          <span>点击课程查看详情</span>
        </div>
      </div>

      {courses.length === 0 ? (
        <EmptyState title="该学期暂无课表" />
      ) : (
        <ScheduleGrid
          schedule={courses}
          week={viewingWeek}
          highlightDay={weekOffset === 0 ? isoDayOfWeek(new Date()) : undefined}
          onCourseClick={setSelected}
        />
      )}

      <CourseDetailDialog
        course={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function CourseDetailDialog({
  course,
  onClose,
}: {
  course: CourseSchedule | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!course} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {course && (
          <>
            <DialogHeader>
              <DialogTitle>{course.courseName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  {course.teacher || "未注明"}
                </span>
                <span>周次：{course.weeks}</span>
                {course.credit != null && <span>学分：{course.credit}</span>}
              </div>
              <div className="space-y-2">
                {course.sessions.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="text-sm font-medium">
                      {DAY_NAMES[s.dayOfWeek - 1]}{" "}
                      {s.startTime} - {s.endTime}
                      <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                        第 {s.startSection}-{s.endSection} 节
                        {s.weekType === "odd"
                          ? " · 单周"
                          : s.weekType === "even"
                            ? " · 双周"
                            : ""}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {s.location}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-[480px] w-full" />
    </div>
  );
}
