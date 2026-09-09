"use client";

import * as React from "react";
import Link from "next/link";
import {
  Archive, Download, File, FileAudio, FileImage, FileText, Film, HardDrive,
  Loader2, MoreHorizontal, RefreshCw, ShieldCheck, Trash2, UploadCloud,
} from "lucide-react";
import type { DriveFile, DriveSummary } from "@/lib/drive-types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ApiFailure { error?: { message?: string } }
interface UploadState { name: string; progress: number }

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function fileIcon(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "heic"].includes(extension)) return FileImage;
  if (["mp3", "wav", "m4a", "aac", "flac"].includes(extension)) return FileAudio;
  if (["mp4", "mov", "mkv", "avi", "webm"].includes(extension)) return Film;
  if (["zip", "rar", "7z", "tar", "gz"].includes(extension)) return Archive;
  if (["txt", "md", "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(extension)) return FileText;
  return File;
}

export default function DrivePage() {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [summary, setSummary] = React.useState<DriveSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [upload, setUpload] = React.useState<UploadState | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DriveFile | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const response = await fetch("/api/drive", { credentials: "include", cache: "no-store" });
      const body = await response.json().catch(() => null) as DriveSummary | ApiFailure | null;
      if (!response.ok) throw new Error((body as ApiFailure)?.error?.message ?? "云盘暂时不可用。");
      setSummary(body as DriveSummary);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "云盘暂时不可用。");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length || upload) return;
    for (const file of list) {
      if (summary && file.size > summary.maxFileBytes) {
        setError(`“${file.name}”超过单文件 ${formatBytes(summary.maxFileBytes)} 的限制。`);
        break;
      }
      setUpload({ name: file.name, progress: 0 });
      setError(null);
      try {
        await new Promise<void>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("POST", "/api/drive");
          request.setRequestHeader("x-file-name", encodeURIComponent(file.name));
          request.upload.onprogress = (event) => {
            if (event.lengthComputable) setUpload({ name: file.name, progress: Math.round(event.loaded / event.total * 100) });
          };
          request.onload = () => {
            if (request.status >= 200 && request.status < 300) resolve();
            else {
              let body: ApiFailure = {};
              try { body = JSON.parse(request.responseText || "{}"); } catch { /* Keep the generic message. */ }
              reject(new Error(body.error?.message ?? "上传失败，请稍后重试。"));
            }
          };
          request.onerror = () => reject(new Error("网络连接失败，请稍后重试。"));
          request.send(file);
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "上传失败，请稍后重试。");
        break;
      } finally {
        setUpload(null);
      }
      await load();
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/drive?name=${encodeURIComponent(deleteTarget.name)}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as ApiFailure | null;
        throw new Error(body?.error?.message ?? "删除失败，请稍后重试。");
      }
      setDeleteTarget(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败，请稍后重试。");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <DriveSkeleton />;
  const usage = summary?.quotaBytes ? Math.min(100, summary.usedBytes / summary.quotaBytes * 100) : 0;

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <PageHeader
        title="云盘"
        description="把常用文件安全地留在自己的服务器上"
        action={<Button onClick={() => inputRef.current?.click()} disabled={Boolean(upload)}><UploadCloud />上传文件</Button>}
      />

      {error && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <span>{error}</span><Button variant="ghost" size="sm" onClick={() => void load()}><RefreshCw />重试</Button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/60 pb-5">
            <div className="flex items-center justify-between gap-4">
              <div><CardTitle className="text-base">我的文件</CardTitle><p className="mt-1 text-xs text-muted-foreground">{summary?.files.length ?? 0} 个文件</p></div>
              <input ref={inputRef} className="hidden" type="file" multiple onChange={(event) => event.target.files && void uploadFiles(event.target.files)} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {summary?.files.length ? (
              <div className="divide-y divide-border/60">
                {summary.files.map((file) => <FileRow key={file.name} file={file} onDelete={() => setDeleteTarget(file)} />)}
              </div>
            ) : (
              <div className="px-5 py-14 text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><HardDrive className="h-5 w-5" /></span>
                <p className="mt-4 text-sm font-medium">云盘还是空的</p>
                <p className="mt-1 text-xs text-muted-foreground">上传课件、文档或照片，登录后随时取用</p>
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-5">
          <Card><CardContent className="p-5">
            <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">存储空间</span><span className="text-xs tabular-nums text-muted-foreground">{formatBytes(summary?.usedBytes ?? 0)} / {formatBytes(summary?.quotaBytes ?? 0)}</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${usage}%` }} /></div>
            <p className="mt-3 text-xs text-muted-foreground">还可上传 {formatBytes(summary?.availableBytes ?? 0)}</p>
          </CardContent></Card>

          <button
            type="button"
            className={cn("flex w-full flex-col items-center rounded-2xl border border-dashed p-7 text-center transition-colors disabled:cursor-wait", dragging ? "border-primary bg-primary/5" : "border-border bg-card/50 hover:border-primary/40 hover:bg-card")}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void uploadFiles(event.dataTransfer.files); }}
            disabled={Boolean(upload)}
          >
            {upload ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <UploadCloud className="h-6 w-6 text-muted-foreground" />}
            <span className="mt-3 max-w-full truncate text-sm font-medium">{upload ? `正在上传 ${upload.name}` : "拖放到这里上传"}</span>
            <span className="mt-1 text-xs text-muted-foreground">{upload ? `${upload.progress}%` : `单个文件最大 ${formatBytes(summary?.maxFileBytes ?? 0)}`}</span>
            {upload && <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${upload.progress}%` }} /></div>}
          </button>

          <div className="flex gap-2 rounded-xl px-1 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><p>文件不公开展示，只有登录当前教务账号后才能访问。</p></div>
        </aside>
      </div>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>删除这个文件？</DialogTitle><DialogDescription className="break-all">“{deleteTarget?.name}”删除后无法恢复。</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>取消</Button><Button variant="destructive" onClick={() => void confirmDelete()} disabled={deleting}>{deleting && <Loader2 className="animate-spin" />}删除</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FileRow({ file, onDelete }: { file: DriveFile; onDelete: () => void }) {
  const Icon = fileIcon(file.name);
  const date = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(file.modifiedAt));
  const downloadUrl = `/api/drive/file?name=${encodeURIComponent(file.name)}`;
  return (
    <div className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:px-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary"><Icon className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{file.name}</p><p className="mt-1 text-xs text-muted-foreground">{formatBytes(file.size)} · {date}</p></div>
      <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label={`下载 ${file.name}`}><Link href={downloadUrl}><Download /></Link></Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="更多操作"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild><Link href={downloadUrl}><Download />下载</Link></DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}><Trash2 />删除</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function DriveSkeleton() {
  return <div className="mx-auto max-w-5xl space-y-5"><Skeleton className="h-10 w-52" /><div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]"><Skeleton className="h-96" /><div className="space-y-5"><Skeleton className="h-28" /><Skeleton className="h-48" /></div></div></div>;
}
