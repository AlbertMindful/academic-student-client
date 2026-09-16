"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountLoginForm() {
  const [status, setStatus] = React.useState<{ setupComplete: boolean; authenticated: boolean } | null>(null);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [visible, setVisible] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => { void api.getAccountStatus().then((value) => {
    if (value.authenticated) window.location.replace("/dashboard");
    else setStatus(value);
  }).catch((cause) => setError(cause instanceof Error ? cause.message : "账户服务暂时不可用。")); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!status || loading) return;
    setError(null);
    if (!username.trim() || !password) return setError("请输入用户名和密码。");
    if (!status.setupComplete && password !== confirm) return setError("两次输入的密码不一致。");
    setLoading(true);
    try {
      if (status.setupComplete) await api.loginAccount(username, password);
      else await api.setupAccount(username, password);
      window.location.replace("/dashboard");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "操作失败，请稍后重试。");
      setLoading(false);
    }
  }

  if (!status && !error) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const setup = status ? !status.setupComplete : false;
  return <form onSubmit={submit} className="space-y-5">
    {setup && <div className="rounded-xl border bg-muted/30 px-3.5 py-3 text-xs leading-5 text-muted-foreground">首次升级：创建只属于这个系统的账户。创建后，教务系统将作为数据来源单独管理。</div>}
    <div className="space-y-2"><Label htmlFor="app-username">系统用户名</Label><div className="relative"><User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="app-username" autoComplete="username" className="pl-9" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="3–32 位字母或数字" /></div></div>
    <div className="space-y-2"><Label htmlFor="app-password">系统密码</Label><div className="relative"><Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="app-password" type={visible ? "text" : "password"} autoComplete={setup ? "new-password" : "current-password"} className="pl-9 pr-10" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={setup ? "至少 10 位" : "请输入密码"} /><button type="button" onClick={() => setVisible((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label={visible ? "隐藏密码" : "显示密码"}>{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
    {setup && <div className="space-y-2"><Label htmlFor="app-confirm">确认密码</Label><Input id="app-confirm" type={visible ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="再次输入密码" /></div>}
    {error && <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}{setup && error.includes("教务") && <div className="mt-2"><Link href="/connect/academic" className="font-medium underline">先连接教务系统</Link></div>}</div>}
    <Button type="submit" size="lg" className="w-full" disabled={!status || loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}{setup ? "创建系统账户" : "登录"}</Button>
  </form>;
}
