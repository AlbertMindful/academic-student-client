"use client";

import * as React from "react";
import { Download, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallButton() {
  const [promptEvent, setPromptEvent] = React.useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = React.useState(false);
  const [isIos, setIsIos] = React.useState(false);
  const [installed, setInstalled] = React.useState(true);

  React.useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setInstalled(standalone);
    setIsIos(ios && !standalone);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
      setInstalled(false);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!promptEvent && !isIos)) return null;

  async function install() {
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPromptEvent(null);
    } else {
      setShowIosHelp(true);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="rounded-full"
        onClick={() => void install()}
        aria-label="安装教务助手"
        title="安装教务助手"
      >
        <Download className="h-[18px] w-[18px]" />
      </Button>

      <Dialog open={showIosHelp} onOpenChange={setShowIosHelp}>
        <DialogContent className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>安装到 iPhone</DialogTitle>
            <DialogDescription>只需两步，就能像普通 App 一样从主屏幕打开。</DialogDescription>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            <div className="flex items-center gap-3 rounded-2xl bg-muted/70 p-3.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-background text-primary shadow-sm"><Share className="h-4 w-4" /></span>
              <div><div className="text-sm font-medium">1. 点击 Safari 的分享按钮</div><div className="mt-0.5 text-xs text-muted-foreground">通常位于浏览器底部工具栏</div></div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-muted/70 p-3.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-background text-primary shadow-sm"><SquarePlus className="h-4 w-4" /></span>
              <div><div className="text-sm font-medium">2. 选择“添加到主屏幕”</div><div className="mt-0.5 text-xs text-muted-foreground">确认后即可获得独立应用图标</div></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
