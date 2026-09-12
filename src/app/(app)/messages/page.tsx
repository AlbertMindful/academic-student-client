"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft, Download, File, FileAudio, FileImage, Film, Loader2,
  MessagesSquare, RefreshCw, Search, ShieldCheck, Users,
} from "lucide-react";
import type {
  ChaoxingChatDetailPayload, ChaoxingChatGroup, ChaoxingMessageKind,
} from "@/lib/chaoxing-chat-types";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function formatBytes(bytes?: number): string | null {
  if (bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
}

function messageIcon(kind: ChaoxingMessageKind) {
  if (kind === "image") return FileImage;
  if (kind === "video") return Film;
  if (kind === "voice") return FileAudio;
  return File;
}

function messageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat("zh-CN", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function MessagesPage() {
  const [groups, setGroups] = React.useState<ChaoxingChatGroup[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ChaoxingChatDetailPayload | null>(null);
  const [query, setQuery] = React.useState("");
  const [loadingGroups, setLoadingGroups] = React.useState(true);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; reconnect: boolean; webUnavailable: boolean } | null>(null);

  const loadGroups = React.useCallback(async () => {
    setLoadingGroups(true);
    try {
      const payload = await api.getChaoxingChats();
      setGroups(payload.groups);
      setSelectedId((current) => current && payload.groups.some((group) => group.id === current)
        ? current : payload.groups[0]?.id ?? null);
      setError(null);
    } catch (cause) {
      setError({
        message: cause instanceof Error ? cause.message : "学习通群聊暂时无法访问。",
        reconnect: cause instanceof ApiError && ["NOT_CONNECTED", "CHAOXING_REAUTH_REQUIRED"].includes(cause.code),
        webUnavailable: cause instanceof ApiError && cause.code === "CHAT_WEB_UNAVAILABLE",
      });
    } finally { setLoadingGroups(false); }
  }, []);

  const loadDetail = React.useCallback(async (groupId: string) => {
    setLoadingDetail(true);
    try {
      setDetail(await api.getChaoxingChat(groupId));
      setError(null);
    } catch (cause) {
      setDetail(null);
      setError({
        message: cause instanceof Error ? cause.message : "群聊消息暂时无法读取。",
        reconnect: cause instanceof ApiError && ["NOT_CONNECTED", "CHAOXING_REAUTH_REQUIRED"].includes(cause.code),
        webUnavailable: cause instanceof ApiError && cause.code === "CHAT_WEB_UNAVAILABLE",
      });
    } finally { setLoadingDetail(false); }
  }, []);

  React.useEffect(() => { void loadGroups(); }, [loadGroups]);
  React.useEffect(() => { if (selectedId) void loadDetail(selectedId); else setDetail(null); }, [selectedId, loadDetail]);

  const filteredGroups = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? groups.filter((group) => group.name.toLocaleLowerCase().includes(needle)) : groups;
  }, [groups, query]);

  return (
    <div className="mx-auto max-w-6xl pb-12">
      <PageHeader
        title="学习通消息"
        description="集中查看群聊消息与文件"
        action={<Button variant="outline" onClick={() => selectedId ? void loadDetail(selectedId) : void loadGroups()} disabled={loadingGroups || loadingDetail}><RefreshCw className={cn((loadingGroups || loadingDetail) && "animate-spin")} />刷新</Button>}
      />

      <div className="mb-5 flex items-center gap-2 rounded-xl border border-border/70 bg-muted/35 px-4 py-3 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
        <span>只读模式：不会发送消息、修改群聊或主动标记已读。</span>
      </div>

      {error && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <span>{error.message}</span>
          {error.reconnect
            ? <Button asChild size="sm" variant="outline"><Link href="/data">重新连接</Link></Button>
            : error.webUnavailable
              ? <Button asChild size="sm" variant="outline"><a href="https://apps.chaoxing.com/t" target="_blank" rel="noreferrer">打开学习通客户端</a></Button>
            : <Button size="sm" variant="ghost" onClick={() => selectedId ? void loadDetail(selectedId) : void loadGroups()}><RefreshCw />重试</Button>}
        </div>
      )}

      <Card className="min-h-[620px] overflow-hidden">
        <CardContent className="grid min-h-[620px] p-0 md:grid-cols-[300px_minmax(0,1fr)]">
          <aside className={cn("border-r border-border/60", selectedId && "hidden md:block")}>
            <div className="border-b border-border/60 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索群聊"
                  className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            {loadingGroups ? <GroupSkeleton /> : filteredGroups.length ? (
              <div className="max-h-[558px] overflow-y-auto p-2">
                {filteredGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedId(group.id)}
                    className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors", selectedId === group.id ? "bg-foreground text-background" : "hover:bg-muted")}
                  >
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", selectedId === group.id ? "bg-background/15" : "bg-primary/10 text-primary")}><Users className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{group.name}</span>{group.memberCount !== undefined && <span className={cn("mt-0.5 block text-xs", selectedId === group.id ? "text-background/65" : "text-muted-foreground")}>{group.memberCount} 位成员</span>}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-6 py-20 text-center"><MessagesSquare className="mx-auto h-8 w-8 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">{query ? "没有匹配的群聊" : "暂时没有可查看的群聊"}</p></div>
            )}
          </aside>

          <main className={cn("min-w-0", !selectedId && "hidden md:block")}>
            {!selectedId ? <Welcome /> : loadingDetail ? <MessageSkeleton /> : detail ? (
              <div className="flex h-full min-h-[620px] flex-col">
                <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3.5 md:px-5">
                  <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setSelectedId(null)} aria-label="返回群聊列表"><ArrowLeft /></Button>
                  <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{detail.group.name}</h2><p className="mt-0.5 text-xs text-muted-foreground">最近 {detail.messages.length} 条消息</p></div>
                </div>

                {detail.files.length > 0 && (
                  <section className="border-b border-border/60 bg-muted/20 px-4 py-3 md:px-5">
                    <p className="mb-2 text-xs font-medium text-muted-foreground">群文件 · {detail.files.length}</p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {detail.files.map((file) => (
                        <a key={file.id} href={`/api/chaoxing/chats/download?token=${encodeURIComponent(file.downloadToken)}`} className="flex min-w-[210px] max-w-[260px] items-center gap-3 rounded-xl border bg-background px-3 py-2.5 transition-colors hover:bg-muted">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><File className="h-4 w-4" /></span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{file.name}</span>{formatBytes(file.size) && <span className="text-[11px] text-muted-foreground">{formatBytes(file.size)}</span>}</span>
                          <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </a>
                      ))}
                    </div>
                  </section>
                )}

                <div className="flex-1 overflow-y-auto px-4 py-2 md:max-h-[500px] md:px-5">
                  {detail.messages.length ? detail.messages.map((message) => {
                    const AttachmentIcon = messageIcon(message.kind);
                    return (
                      <article key={message.id} className="border-b border-border/50 py-4 last:border-0">
                        <div className="flex items-baseline justify-between gap-3"><p className="truncate text-sm font-medium">{message.senderName}</p><time className="shrink-0 text-[11px] text-muted-foreground">{messageTime(message.sentAt)}</time></div>
                        {message.text && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/85">{message.text}</p>}
                        {message.attachment && (
                          <a href={`/api/chaoxing/chats/download?token=${encodeURIComponent(message.attachment.downloadToken)}`} className="mt-3 flex max-w-md items-center gap-3 rounded-xl border bg-muted/25 p-3 transition-colors hover:bg-muted/60">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-primary"><AttachmentIcon className="h-4 w-4" /></span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{message.attachment.name}</span>{formatBytes(message.attachment.size) && <span className="text-[11px] text-muted-foreground">{formatBytes(message.attachment.size)}</span>}</span>
                            <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </a>
                        )}
                        {!message.text && !message.attachment && <p className="mt-1.5 text-xs text-muted-foreground">此消息类型暂不支持预览</p>}
                      </article>
                    );
                  }) : <div className="py-24 text-center text-sm text-muted-foreground">这个群聊暂时没有可显示的消息</div>}
                </div>
              </div>
            ) : <Welcome />}
          </main>
        </CardContent>
      </Card>
    </div>
  );
}

function Welcome() {
  return <div className="flex min-h-[620px] flex-col items-center justify-center px-6 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><MessagesSquare className="h-6 w-6" /></span><p className="mt-4 text-sm font-medium">选择一个群聊</p><p className="mt-1 text-xs text-muted-foreground">消息仅供查看，不会影响学习通中的状态</p></div>;
}

function GroupSkeleton() {
  return <div className="space-y-2 p-3">{Array.from({ length: 7 }, (_, index) => <div key={index} className="flex items-center gap-3 p-2"><Skeleton className="h-9 w-9 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-2.5 w-1/3" /></div></div>)}</div>;
}

function MessageSkeleton() {
  return <div className="p-5"><div className="mb-6 flex items-center gap-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /><span className="text-sm text-muted-foreground">正在读取消息…</span></div><div className="space-y-7">{Array.from({ length: 5 }, (_, index) => <div key={index} className="space-y-2"><div className="flex justify-between"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-16" /></div><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>)}</div></div>;
}
