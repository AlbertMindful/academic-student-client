"use client";

import * as React from "react";
import Image from "next/image";
import { Check, Loader2, QrCode, Unplug } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ChaoxingConnect({ onConnected, requiresReconnect = false }: { onConnected?: () => void; requiresReconnect?: boolean }) {
  const [connected, setConnected] = React.useState<boolean | null>(null);
  const [open, setOpen] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<"idle" | "loading" | "waiting" | "scanned" | "connected" | "expired" | "error">("idle");

  React.useEffect(() => { void api.getChaoxingSession().then((result) => setConnected(result.connected)).catch(() => setConnected(false)); }, []);
  React.useEffect(() => {
    if (requiresReconnect) setConnected(false);
  }, [requiresReconnect]);

  React.useEffect(() => {
    if (!open || !pendingId || (status !== "waiting" && status !== "scanned")) return;
    const id = window.setInterval(() => {
      void api.pollChaoxingConnection(pendingId).then(async (result) => {
        setStatus(result.status);
        if (result.status === "connected") {
          window.clearInterval(id);
          const verified = await api.getChaoxingSession().catch(() => ({ connected: false }));
          setConnected(verified.connected);
          if (verified.connected) onConnected?.();
          else setStatus("error");
        }
      }).catch(() => setStatus("error"));
    }, 3000);
    return () => window.clearInterval(id);
  }, [onConnected, open, pendingId, status]);

  async function begin() {
    setOpen(true);
    setStatus("loading");
    try {
      const result = await api.startChaoxingConnection();
      setPendingId(result.pendingId);
      setStatus("waiting");
    } catch { setStatus("error"); }
  }

  async function disconnect() {
    await api.disconnectChaoxing();
    setConnected(false);
  }

  if (connected == null) return <Button variant="outline" size="sm" disabled><Loader2 className="h-3.5 w-3.5 animate-spin" />检查中</Button>;
  return (
    <>
      {connected ? <Button variant="ghost" size="sm" onClick={() => void disconnect()}><Unplug className="h-3.5 w-3.5" />断开</Button> : <Button variant="outline" size="sm" onClick={() => void begin()}><QrCode className="h-3.5 w-3.5" />连接学习通</Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>连接学习通</DialogTitle><DialogDescription>打开学习通 App 扫描并确认登录。连接后将同步与你当前课程有关的通知、作业与考试等信息。</DialogDescription></DialogHeader>
          <div className="flex min-h-64 flex-col items-center justify-center py-3">
            {pendingId && (status === "waiting" || status === "scanned") && <div className="rounded-xl border bg-white p-3"><Image src={`/api/chaoxing/connect/qr?pendingId=${encodeURIComponent(pendingId)}`} alt="学习通登录二维码" width={208} height={208} unoptimized priority /></div>}
            {status === "loading" && <><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /><p className="mt-3 text-sm text-muted-foreground">正在生成二维码</p></>}
            {status === "waiting" && <p className="mt-4 text-sm text-muted-foreground">等待扫码…</p>}
            {status === "scanned" && <p className="mt-4 text-sm font-medium text-primary">已扫码，请在手机上确认</p>}
            {status === "connected" && <><span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600"><Check className="h-6 w-6" /></span><p className="mt-4 text-sm font-medium">学习通已连接</p><Button className="mt-5" size="sm" onClick={() => setOpen(false)}>完成</Button></>}
            {(status === "expired" || status === "error") && <><p className="max-w-xs text-center text-sm leading-6 text-muted-foreground">连接没有完成，请重新获取二维码并在学习通 App 中确认登录。</p><Button className="mt-4" variant="outline" size="sm" onClick={() => void begin()}>重新获取</Button></>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
