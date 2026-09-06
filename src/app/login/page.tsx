import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";

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

      <Link href="/dashboard" className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />返回学业中心
      </Link>

      <div className="w-full max-w-sm page-enter">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_30px_hsl(var(--primary)/.28)]">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.035em]">个人学业中心</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              今天需要知道的事，都在这里
            </p>
          </div>
        </div>

        <div className="surface rounded-[1.35rem] p-6">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
