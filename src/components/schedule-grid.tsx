"use client";

import type { CourseSchedule, CourseSession } from "@/lib/types";
import { PERIODS } from "@/lib/periods";
import { courseColor, sessionOnWeek } from "@/lib/schedule";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

interface Block {
  course: CourseSchedule;
  session: CourseSession;
}

export function ScheduleGrid({
  schedule,
  week,
  highlightDay,
  onCourseClick,
}: {
  schedule: CourseSchedule[];
  week: number;
  highlightDay?: number;
  onCourseClick?: (course: CourseSchedule) => void;
}) {
  const blocks: Block[] = [];
  for (const course of schedule) {
    for (const session of course.sessions) {
      if (sessionOnWeek(course, session, week)) {
        blocks.push({ course, session });
      }
    }
  }

  const ROWS = PERIODS.length;
  const COLS = 7;
  const grid: (Block | null)[][] = Array.from({ length: ROWS }, () =>
    Array<Block | null>(COLS).fill(null),
  );
  const covered: boolean[][] = Array.from({ length: ROWS }, () =>
    Array<boolean>(COLS).fill(false),
  );

  for (const block of blocks) {
    const r = block.session.startSection - 1;
    const c = block.session.dayOfWeek - 1;
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
    const span = Math.min(
      block.session.endSection - block.session.startSection + 1,
      ROWS - r,
    );
    grid[r][c] = block;
    for (let k = 0; k < span; k++) covered[r + k][c] = true;
  }

  return (
    <div className="scrollbar-thin overflow-x-auto rounded-xl border bg-card shadow-sm">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="w-14 border-r px-2 py-2.5 text-center text-xs font-medium text-muted-foreground">
              节次
            </th>
            {DAY_LABELS.map((label, i) => (
              <th
                key={label}
                className={cn(
                  "border-r px-2 py-2.5 text-center text-xs font-medium",
                  highlightDay === i + 1
                    ? "bg-primary/5 text-primary"
                    : "text-muted-foreground",
                )}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((p, r) => (
            <tr key={p.section} className="border-b last:border-b-0">
              <td className="border-r px-2 py-1 text-center align-middle text-xs text-muted-foreground">
                {p.section}
                <div className="text-[10px] text-muted-foreground/60">
                  {p.start}
                </div>
              </td>
              {DAY_LABELS.map((_, c) => {
                const block = grid[r][c];
                if (block) {
                  const span = Math.min(
                    block.session.endSection - block.session.startSection + 1,
                    ROWS - r,
                  );
                  const color = courseColor(block.course.courseName);
                  return (
                    <td
                      key={c}
                      rowSpan={span}
                      className={cn(
                        "border-r p-1 align-top",
                        highlightDay === c + 1 && "bg-primary/[0.03]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onCourseClick?.(block.course)}
                        className={cn(
                          "flex h-full w-full flex-col gap-0.5 rounded-lg border p-1.5 text-left transition-opacity hover:opacity-90",
                          color.bg,
                          color.border,
                        )}
                        title={`${block.course.courseName}\n${block.course.teacher}\n${block.session.location}\n${block.course.weeks} · 第${block.session.startSection}-${block.session.endSection}节`}
                      >
                        <div
                          className={cn(
                            "line-clamp-2 text-xs font-medium leading-tight",
                            color.text,
                          )}
                        >
                          {block.course.courseName}
                        </div>
                        {span >= 2 && (
                          <>
                            <div className="line-clamp-1 text-[11px] text-muted-foreground">
                              {block.session.location}
                            </div>
                            <div className="line-clamp-1 text-[11px] text-muted-foreground">
                              {block.course.teacher}
                            </div>
                          </>
                        )}
                      </button>
                    </td>
                  );
                }
                if (!covered[r][c]) {
                  return (
                    <td
                      key={c}
                      className={cn(
                        "border-r p-1",
                        highlightDay === c + 1 && "bg-primary/[0.03]",
                      )}
                    />
                  );
                }
                return null;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
