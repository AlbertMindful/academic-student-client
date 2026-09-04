import { GraduationCap } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { serverConfig } from "@/server/config";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      {/* 背景装饰 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.08),transparent)]"
      />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">教务助手</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              现代化教务系统学生客户端
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <LoginForm dataSource={serverConfig.dataSource} />
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          只读访问 · 不保存密码 · 不共享学校会话
        </p>
      </div>
    </div>
  );
}
