"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Bell,
  ChartNoAxesColumn,
  ClipboardList,
  Compass,
  GraduationCap,
  LayoutDashboard,
  LogIn,
  LogOut,
  ListTodo,
  Menu,
  MoreHorizontal,
  User,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { clearProviderCache } from "@/lib/academic-store";
import { useSession } from "@/hooks/use-session";
import { ThemeToggle } from "@/components/theme-toggle";
import { PwaInstallButton } from "@/components/pwa-install-button";
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

const PRIMARY_NAV = [
  { href: "/dashboard", label: "今天", icon: LayoutDashboard },
  { href: "/activity", label: "所有动态", icon: Bell },
  { href: "/schedule", label: "课表", icon: CalendarDays },
  { href: "/todos", label: "待办", icon: ListTodo },
];

const MORE_NAV = [
  { href: "/grades", label: "成绩", icon: ChartNoAxesColumn },
  { href: "/exams", label: "考试", icon: ClipboardList },
  { href: "/insights", label: "学业洞察", icon: Compass },
  { href: "/data", label: "数据来源", icon: Database },
];

function NavItems({ items, onNavigate }: { items: typeof PRIMARY_NAV; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1.5">
      {items.map(({ href, label, icon: Icon }) => {
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
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
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

function DesktopNav() {
  const pathname = usePathname();
  const activeMore = MORE_NAV.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
  const MoreIcon = activeMore?.icon ?? MoreHorizontal;
  return (
    <div className="flex flex-col gap-1.5">
      <NavItems items={PRIMARY_NAV} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn(
            "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
            activeMore ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}>
            <MoreIcon className="h-[18px] w-[18px]" />
            {activeMore?.label ?? "更多"}
            <MoreHorizontal className="ml-auto h-4 w-4 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-48">
          {MORE_NAV.map(({ href, label, icon: Icon }) => (
            <DropdownMenuItem key={href} asChild>
              <Link href={href}><Icon className="h-4 w-4" />{label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, profile } = useSession();
  const [loggingOut, setLoggingOut] = React.useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await api.logout();
      await clearProviderCache("academic");
    } finally {
      window.location.replace("/dashboard");
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

  const name = profile?.name ?? "我的学业";
  const initials = name.slice(0, 1) || "学";

  return (
    <div className="flex min-h-screen max-w-full overflow-x-hidden">
      {/* 桌面侧边栏 */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/70 bg-card/70 backdrop-blur-2xl md:flex">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
            <GraduationCap className="h-[18px] w-[18px]" />
          </div>
          <div>
            <span className="block text-sm font-semibold tracking-tight">学业中心</span>
          </div>
        </div>
        <div className="flex-1 px-3">
          <DesktopNav />
        </div>
        <div className="h-3" />
      </aside>

      {/* 主区域 */}
      <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
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
                <NavItems items={PRIMARY_NAV} />
                <DropdownMenuSeparator />
                <DropdownMenuLabel>更多</DropdownMenuLabel>
                <NavItems items={MORE_NAV} />
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="text-sm font-medium md:hidden">学业中心</span>
          </div>

          <div className="flex items-center gap-1.5">
            <PwaInstallButton />
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
                <DropdownMenuItem asChild>
                  <Link href="/data">
                    <Database className="h-4 w-4" />
                    数据与同步
                  </Link>
                </DropdownMenuItem>
                {state === "authenticated" ? (
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      void handleLogout();
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    断开教务系统
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem asChild>
                    <Link href="/login"><LogIn className="h-4 w-4" />连接教务系统</Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1240px] flex-1 overflow-x-hidden px-4 py-6 md:px-8 md:py-9">
          <div key={pathname} className="page-enter">{children}</div>
        </main>
      </div>
    </div>
  );
}
