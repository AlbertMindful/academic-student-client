"use client";

import * as React from "react";
import { ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 滑块人机校验（复现学校 SSO 登录页的拖动校验）。
 * 拖动把手到最右端即视为通过，并通过 onSuccess 返回滑块最大宽度
 * （官方前端将其作为 `code` 上报）。
 */
export function SliderCaptcha({
  onSuccess,
  disabled,
}: {
  onSuccess: (width: number) => void;
  disabled?: boolean;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const handleRef = React.useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [success, setSuccess] = React.useState(false);
  const [offset, setOffset] = React.useState(0);
  // Pointer events may be delivered before React has committed setSuccess(true).
  // Keep an immediate value so pointerup cannot incorrectly snap a completed
  // slider back to the beginning.
  const successRef = React.useRef(false);

  const maxWidth = React.useCallback(() => {
    const track = trackRef.current?.clientWidth ?? 0;
    const handle = handleRef.current?.clientWidth ?? 0;
    return Math.max(0, track - handle);
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (successRef.current || disabled) return;
    e.preventDefault();
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || successRef.current || disabled) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const handleW = handleRef.current?.clientWidth ?? 0;
    let x = e.clientX - rect.left - handleW / 2;
    const max = maxWidth();
    x = Math.max(0, Math.min(x, max));
    setOffset(x);
    if (x >= max - 1) {
      successRef.current = true;
      setSuccess(true);
      setDragging(false);
      setOffset(max);
      onSuccess(Math.round(max));
    }
  }

  function onPointerUp() {
    if (!successRef.current) setOffset(0);
    setDragging(false);
  }

  function completeWithKeyboard() {
    if (successRef.current || disabled) return;
    const max = maxWidth();
    if (max <= 0) return;
    successRef.current = true;
    setSuccess(true);
    setOffset(max);
    onSuccess(Math.round(max));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (successRef.current || disabled) return;
    if (e.key === "End" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      completeWithKeyboard();
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const max = maxWidth();
      const next = Math.min(max, offset + Math.max(10, Math.round(max / 10)));
      if (next >= max) completeWithKeyboard();
      else setOffset(next);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setOffset((current) => Math.max(0, current - 20));
    }
  }

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative h-10 w-full select-none rounded-md border",
        success ? "border-emerald-300 bg-emerald-500/10" : "border-input bg-muted",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute left-0 top-0 h-full rounded-l-md",
          success ? "bg-emerald-500/15" : "bg-primary/15",
        )}
        style={{ width: offset + (handleRef.current?.clientWidth ?? 0) / 2 }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
        {success ? "验证通过" : "向右滑动完成人机校验"}
      </div>
      <div
        ref={handleRef}
        role="slider"
        aria-label="人机校验滑块"
        aria-valuemin={0}
        aria-valuemax={Math.round(maxWidth())}
        aria-valuenow={Math.round(offset)}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute left-0 top-0 flex h-10 w-10 cursor-grab touch-none items-center justify-center rounded-md shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:cursor-grabbing",
          disabled && "cursor-not-allowed opacity-60",
          success
            ? "bg-emerald-500 text-white"
            : "bg-primary text-primary-foreground",
        )}
        style={{ transform: `translateX(${offset}px)` }}
      >
        {success ? (
          <Check className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </div>
    </div>
  );
}
