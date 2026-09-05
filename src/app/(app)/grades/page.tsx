"use client";

import * as React from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { computeGpa, isPassed } from "@/lib/gpa";
import { formatScore } from "@/lib/format";

export default function GradesPage() {
  const [semesterId, setSemesterId] = React.useState<string>("__all__");
  const semesters = useApi(() => api.getSemesters(), []);
  const grades = useApi(
    () => api.getGrades(semesterId === "__all__" ? undefined : semesterId),
    [semesterId],
  );

  if (semesters.loading || grades.loading) return <GradesSkeleton />;
  if (semesters.error) return <ErrorState message={semesters.error.message} />;
  if (grades.error) return <ErrorState message={grades.error.message} />;

  const list = grades.data ?? [];
  const gpa = computeGpa(list, null);
  const hasRetakeResults = list.some(
    (grade) => grade.retakeScore != null || /重修/.test(grade.resultType ?? ""),
  );

  return (
    <div>
      <PageHeader
        title="成绩"
        description="查看各学期成绩与绩点"
        action={
          <select
            value={semesterId}
            onChange={(e) => setSemesterId(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="__all__">全部学期</option>
            {(semesters.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        }
      />

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            绩点概览
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <div className="text-3xl font-semibold tracking-tight">
              {gpa.value != null ? gpa.value.toFixed(2) : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              累计 GPA
            </div>
          </div>
          <div>
            <div className="text-xl font-semibold">{gpa.earnedCredits}</div>
            <div className="mt-1 text-xs text-muted-foreground">已修学分</div>
          </div>
          <div>
            <div className="text-xl font-semibold">{gpa.totalCredits}</div>
            <div className="mt-1 text-xs text-muted-foreground">总学分</div>
          </div>
          <div>
            <div className="text-xl font-semibold">{list.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">课程门数</div>
          </div>
        </CardContent>
      </Card>

      {list.length === 0 ? (
        <EmptyState title="该学期暂无成绩" />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>课程</TableHead>
                <TableHead>学期</TableHead>
                <TableHead className="text-right">成绩</TableHead>
                <TableHead className="text-right">学分</TableHead>
                <TableHead className="text-right">绩点</TableHead>
                {hasRetakeResults && <TableHead>重修</TableHead>}
                <TableHead>性质</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((g) => {
                const passed = isPassed(g.score);
                return (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.courseName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {g.semesterName}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          passed
                            ? "font-medium"
                            : "font-medium text-destructive"
                        }
                      >
                        {formatScore(g.score)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{g.credit}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {g.gradePoint != null ? g.gradePoint.toFixed(1) : "—"}
                    </TableCell>
                    {hasRetakeResults && (
                      <TableCell>
                        {g.retakeScore != null ? (
                          <Badge variant={isPassed(g.retakeScore) ? "success" : "warning"}>重修 {formatScore(g.retakeScore)}</Badge>
                        ) : /重修/.test(g.resultType ?? "") ? (
                          <Badge variant="secondary">{g.resultType}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      {g.category ? (
                        <Badge variant="secondary">{g.category}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function GradesSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
