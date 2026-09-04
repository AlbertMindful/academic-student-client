"use client";

import * as React from "react";
import { Bell, BookOpenCheck, CalendarClock, CheckCheck, Clock3 } from "lucide-react";
import { api } from "@/lib/api-client";
import {
  createAcademicSnapshot,
  detectAcademicChanges,
  isAcademicSnapshot,
  type AcademicSnapshot,
  type ChangeKind,
  type DataChange,
} from "@/lib/data-changes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STORAGE_PREFIX = "academic-change-baseline:v1:";

const CHANGE_ICONS: Record<ChangeKind, React.ElementType> = {
  grade: BookOpenCheck,
  exam: CalendarClock,
  schedule: Clock3,
};

const CHANGE_TONES: Record<ChangeKind, string> = {
  grade: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  exam: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  schedule: "bg-primary/10 text-primary",
};

export function DataChangeCenter({ studentId }: { studentId: string }) {
  const [changes, setChanges] = React.useState<DataChange[]>([]);
  const [currentSnapshot, setCurrentSnapshot] = React.useState<AcademicSnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const storageKey = `${STORAGE_PREFIX}${studentId}`;

  const saveSnapshot = React.useCallback((snapshot: AcademicSnapshot) => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
      return true;
    } catch {
      return false;
    }
  }, [storageKey]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([api.getGrades(), api.getExams(), api.getSchedule()])
      .then(([grades, exams, schedule]) => {
        if (cancelled) return;
        const currentData = { grades, exams, schedule };
        const snapshot = createAcademicSnapshot(currentData);
        setCurrentSnapshot(snapshot);

        let previous: AcademicSnapshot | null = null;
        try {
          const raw = window.localStorage.getItem(storageKey);
          const parsed: unknown = raw ? JSON.parse(raw) : null;
          if (isAcademicSnapshot(parsed)) previous = parsed;
        } catch {
          previous = null;
        }

        if (!previous) {
          saveSnapshot(snapshot);
          setChanges([]);
        } else {
          setChanges(detectAcademicChanges(previous, currentData));
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [saveSnapshot, storageKey]);

  function markAllRead() {
    if (currentSnapshot) {
      saveSnapshot(currentSnapshot);
    }
    setChanges([]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={changes.length ? `${changes.length} 条数据更新` : "数据更新"}
        >
          <Bell className="h-[18px] w-[18px]" />
          {changes.length > 0 && (
            <span className="absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-primary px-0.5 text-[9px] font-bold leading-none text-primary-foreground">
              {changes.length > 9 ? "9+" : changes.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl p-2 shadow-xl">
        <DropdownMenuLabel className="flex items-center justify-between px-2 py-2">
          <div>
            <div className="text-sm font-semibold">数据更新</div>
            <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">与此设备上次查看结果相比</div>
          </div>
          {changes.length > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              <CheckCheck />全部已读
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-muted-foreground">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
            正在检查更新
          </div>
        ) : changes.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCheck className="h-5 w-5" />
            </span>
            <div className="mt-3 text-sm font-medium">已是最新</div>
            <div className="mt-1 text-xs text-muted-foreground">暂未发现成绩、考试或课表变化</div>
          </div>
        ) : (
          <div className="max-h-[min(26rem,65vh)] space-y-1 overflow-y-auto p-1 scrollbar-thin">
            {changes.map((change) => {
              const Icon = CHANGE_ICONS[change.kind];
              return (
                <div key={change.id} className="flex gap-3 rounded-xl px-2.5 py-3 transition-colors hover:bg-muted/70">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${CHANGE_TONES[change.kind]}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{change.title}</div>
                    <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{change.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
