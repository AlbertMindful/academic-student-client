import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppMark } from "@/components/app-mark";

export default function AcademicConnectPage() {
  return <div className="relative flex min-h-screen flex-col items-center justify-center px-4">
    <div className="absolute right-4 top-4"><ThemeToggle /></div>
    <Link href="/data" className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" />返回数据来源</Link>
    <div className="w-full max-w-sm"><div className="mb-8 flex flex-col items-center gap-3 text-center"><AppMark className="h-12 w-12" /><div><h1 className="text-xl font-semibold">连接教务系统</h1><p className="mt-1 text-sm text-muted-foreground">用于同步课表、成绩和考试</p></div></div><div className="surface rounded-[1.35rem] p-6"><LoginForm /></div></div>
  </div>;
}
