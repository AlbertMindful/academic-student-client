"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ChartNoAxesColumn,
  ClipboardList,
  Compass,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useRequireAuth } from "@/hooks/use-session";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { href: "/dashboard", label: "总览", icon: LayoutDashboard },
  { href: "/schedule", label: "课表", icon: CalendarDays },
  { href: "/grades", label: "成绩", icon: ChartNoAxesColumn },
  { href: "/exams", label: "考试", icon: ClipboardList },
  { href: "/insights", label: "学业洞察", icon: Compass },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
              active
                ? "bg-primary text-primary-foreground shadow-[0_8px_20px_hsl(var(--primary)/.22)]"
                : "text-muted-foreground hover:translate-x-0.5 hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { state, profile } = useRequireAuth();
  const [loggingOut, setLoggingOut] = React.useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await api.logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  if (state === "loading") {
    return (
      <div className="flex min-h-screen">
        <aside className="hidden w-60 flex-col gap-4 border-r p-4 md:flex">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </aside>
        <div className="flex-1 space-y-6 p-8">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (state === "unauthenticated") return null;

  const name = profile?.name ?? "同学";
  const initials = name.slice(0, 1) || "学";

  return (
    <div className="flex min-h-screen">
      {/* 桌面侧边栏 */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/70 bg-card/70 backdrop-blur-2xl md:flex">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_20px_hsl(var(--primary)/.24)]">
            <GraduationCap className="h-[18px] w-[18px]" />
          </div>
          <div>
            <span className="block text-sm font-semibold tracking-tight">教务助手</span>
            <span className="block text-[10px] tracking-[0.18em] text-muted-foreground">ACADEMIC OS</span>
          </div>
        </div>
        <div className="flex-1 px-3">
          <NavItems />
        </div>
        <div className="mx-3 mb-3 rounded-xl border bg-background/60 p-3 text-[11px] text-muted-foreground">
          <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
            <span className="h-1.5 w-1.5 animate-[breathe_2s_ease-in-out_infinite] rounded-full bg-emerald-500" />
            数据连接正常
          </div>
          只读访问 · 隐私隔离
        </div>
      </aside>

      {/* 主区域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/70 bg-background/75 px-4 backdrop-blur-xl md:px-8">
          <div className="flex items-center gap-3">
            {/* 移动端导航 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="打开菜单"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52 md:hidden">
                <DropdownMenuLabel>导航</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <NavItems />
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="text-sm font-medium md:hidden">教务助手</span>
          </div>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-accent">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-sm font-medium sm:inline">
                    {name}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{name}</span>
                  </div>
                  {profile?.studentId && (
                    <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                      {profile.studentId}
                    </div>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    void handleLogout();
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 md:px-8 md:py-9">
          <div key={pathname} className="page-enter">{children}</div>
        </main>
      </div>
    </div>
  );
}
