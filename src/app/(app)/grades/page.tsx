"use client";

import * as React from "react";
import { BookOpen, CalendarRange, Layers3 } from "lucide-react";
import type { Grade, Semester } from "@/lib/types";
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { computeGpa } from "@/lib/gpa";
import { formatScore } from "@/lib/format";

const ALL_SEMESTERS = "__all__";

export default function GradesPage() {
  const [semesterId, setSemesterId] = React.useState(ALL_SEMESTERS);
  const semesters = useApi(() => api.getSemesters(), []);
  const grades = useApi(() => api.getGrades(), []);

  if (semesters.loading || grades.loading) return <GradesSkeleton />;
  if (semesters.error) return <ErrorState message={semesters.error.message} />;
  if (grades.error) return <ErrorState message={grades.error.message} />;

  const semesterList = semesters.data ?? [];
  const allGrades = grades.data ?? [];
  const list = semesterId === ALL_SEMESTERS
    ? allGrades
    : allGrades.filter((grade) => grade.semesterId === semesterId);
  const selectedSemester = semesterList.find((semester) => semester.id === semesterId);
  const groups = buildGroups(list, semesterList, selectedSemester);
  const gpa = computeGpa(list, null);

  return (
    <div>
      <PageHeader title="成绩" description="选择学期，查看这一学期的全部课程" />

      <Card className="mb-5 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarRange className="h-4 w-4 text-primary" />
            选择学期
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={semesterId} onValueChange={setSemesterId}>
            <div className="overflow-x-auto pb-1">
              <TabsList className="h-auto min-w-max justify-start">
                <TabsTrigger value={ALL_SEMESTERS}>全部学期</TabsTrigger>
                {semesterList.map((semester) => (
                  <TabsTrigger key={semester.id} value={semester.id} className="gap-2">
                    {shortSemesterName(semester)}
                    {semester.isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>
        </CardContent>
      </Card>

      <div key={semesterId} className="animate-fade-in">
        <Card className="mb-5 overflow-hidden border-primary/10 bg-gradient-to-br from-primary/[0.07] via-card to-card">
          <CardContent className="grid gap-5 p-5 sm:grid-cols-[1.5fr_1fr_1fr] sm:items-center sm:p-6">
            <div>
              <p className="text-sm text-muted-foreground">当前查看</p>
              <p className="mt-1 text-lg font-semibold tracking-tight">{selectedSemester?.name ?? "全部学期"}</p>
            </div>
            <SummaryValue icon={BookOpen} value={list.length} label="课程门数" />
            <SummaryValue icon={Layers3} value={gpa.totalCredits} label="记录学分" />
          </CardContent>
        </Card>

        {list.length === 0 ? (
          <Card><CardContent className="pt-6"><EmptyState title="该学期暂无成绩" description="可以切换到其他学期查看" /></CardContent></Card>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <SemesterGrades key={group.id} name={group.name} grades={group.grades} showSemester={semesterId === ALL_SEMESTERS} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function shortSemesterName(semester: Semester): string {
  const term = semester.term === 1 ? "第一学期" : semester.term === 2 ? "第二学期" : "暑期";
  return `${semester.year} · ${term}`;
}

function buildGroups(grades: Grade[], semesters: Semester[], selected?: Semester) {
  if (selected) return [{ id: selected.id, name: selected.name, grades }];
  const order = new Map(semesters.map((semester, index) => [semester.id, index]));
  const grouped = new Map<string, Grade[]>();
  grades.forEach((grade) => grouped.set(grade.semesterId, [...(grouped.get(grade.semesterId) ?? []), grade]));
  return [...grouped.entries()]
    .sort(([a], [b]) => (order.get(a) ?? 999) - (order.get(b) ?? 999))
    .map(([id, items]) => ({ id, name: items[0]?.semesterName || id, grades: items }));
}

function SummaryValue({ icon: Icon, value, label }: { icon: typeof BookOpen; value: number; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-background/65 p-3 sm:bg-transparent sm:p-0">
      <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span>
      <div><p className="text-xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>
    </div>
  );
}

function SemesterGrades({ name, grades, showSemester }: { name: string; grades: Grade[]; showSemester: boolean }) {
  const gpa = computeGpa(grades, null);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-end justify-between space-y-0 border-b border-border/60 bg-muted/20 pb-4">
        <div>
          <CardTitle className="text-base">{showSemester ? name : "全部课程"}</CardTitle>
          <CardDescription className="mt-1">{grades.length} 门课程 · {gpa.totalCredits} 学分</CardDescription>
        </div>
        {gpa.value != null && (
          <div className="text-right"><p className="text-lg font-semibold tabular-nums">{gpa.value.toFixed(2)}</p><p className="text-[11px] text-muted-foreground">平均绩点</p></div>
        )}
      </CardHeader>
      <CardContent className="divide-y divide-border/60 p-0">
        {grades.map((grade) => <GradeRow key={grade.id} grade={grade} />)}
      </CardContent>
    </Card>
  );
}

function GradeRow({ grade }: { grade: Grade }) {
  return (
    <div className="group grid gap-3 px-5 py-4 transition-colors duration-200 hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{grade.courseName}</p>
          {grade.category && <Badge variant="secondary">{grade.category}</Badge>}
          {grade.resultType && <Badge variant="outline">{grade.resultType}</Badge>}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {grade.courseCode && <span>{grade.courseCode}</span>}
          <span>{grade.credit} 学分</span>
          {grade.examType && <span>{grade.examType}</span>}
          {grade.gradePoint != null && <span>绩点 {grade.gradePoint.toFixed(1)}</span>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        {grade.retakeScore != null && <span className="text-xs text-muted-foreground">重修 {formatScore(grade.retakeScore)}</span>}
        <div className="min-w-14 text-left sm:text-right">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatScore(grade.score)}</p>
          <p className="text-[11px] text-muted-foreground">成绩</p>
        </div>
      </div>
    </div>
  );
}

function GradesSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
