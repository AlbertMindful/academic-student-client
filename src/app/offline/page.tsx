import Link from "next/link";
import { CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="surface w-full max-w-sm rounded-3xl p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <CloudOff className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-[-0.035em]">暂时无法连接</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          为保护教务数据，本应用不会离线保存课表、成绩或登录信息。恢复网络后即可继续使用。
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/dashboard"><RefreshCw />重新连接</Link>
        </Button>
      </div>
    </main>
  );
}
