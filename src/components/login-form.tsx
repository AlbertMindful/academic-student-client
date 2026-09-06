"use client";

import * as React from "react";
import {
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Loader2,
  Lock,
  MessageSquareText,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SliderCaptcha } from "@/components/slider-captcha";
import { api, ApiError } from "@/lib/api-client";

export function LoginForm() {
  const [tab, setTab] = React.useState("password");
  const [error, setError] = React.useState<string | null>(null);

  // 密码登录
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [pwLoading, setPwLoading] = React.useState(false);

  // 短信验证码登录
  const [smsUsername, setSmsUsername] = React.useState("");
  const [sliderKey, setSliderKey] = React.useState(0);
  const [captchaDone, setCaptchaDone] = React.useState(false);
  const [captchaWidth, setCaptchaWidth] = React.useState(0);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [smsCode, setSmsCode] = React.useState("");
  const [cooldown, setCooldown] = React.useState(0);
  const [codeSent, setCodeSent] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [smsLoading, setSmsLoading] = React.useState(false);
  const codeInputRef = React.useRef<HTMLInputElement>(null);
  const [cooldownDeadline, setCooldownDeadline] = React.useState(0);
  const [cooldownTotal, setCooldownTotal] = React.useState(0);

  React.useEffect(() => {
    if (cooldownDeadline <= 0) return;
    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((cooldownDeadline - Date.now()) / 1000),
      );
      setCooldown(remaining);
      if (remaining === 0) setCooldownDeadline(0);
    };
    const id = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", update);
    };
  }, [cooldownDeadline]);

  function resetSmsFlow() {
    setCaptchaDone(false);
    setCaptchaWidth(0);
    setPendingId(null);
    setSmsCode("");
    setCooldown(0);
    setCodeSent(false);
    setCooldownDeadline(0);
    setCooldownTotal(0);
  }

  function onSmsUsernameChange(v: string) {
    setSmsUsername(v);
    setSliderKey((k) => k + 1);
    resetSmsFlow();
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pwLoading) return;
    setError(null);
    if (!username.trim()) return setError("请输入教务系统账号。");
    if (!password) return setError("请输入密码。");
    setPwLoading(true);
    try {
      await api.login(username.trim(), password);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录失败，请稍后重试。");
      setPwLoading(false);
    }
  }

  async function onSendCode() {
    if (sending || cooldown > 0) return;
    setError(null);
    if (!smsUsername.trim()) return setError("请输入教务系统账号。");
    if (!captchaDone) return setError("请先完成人机校验。");
    setSending(true);
    try {
      const res = await api.smsSend(
        smsUsername.trim(),
        captchaWidth,
        pendingId ?? undefined,
      );
      setPendingId(res.pendingId);
      const seconds = Math.max(1, res.cooldown);
      setCooldownTotal(seconds);
      setCooldownDeadline(Date.now() + seconds * 1000);
      setCooldown(seconds);
      setCodeSent(true);
      setSmsCode("");
      // A resend must use a fresh human check, while the code that was just
      // sent remains fully usable through pendingId.
      setCaptchaDone(false);
      setCaptchaWidth(0);
      setSliderKey((k) => k + 1);
      window.setTimeout(() => codeInputRef.current?.focus(), 0);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "验证码发送失败，请稍后重试。",
      );
      // When a resend fails, preserve the previous pending login so its code
      // can still be submitted. Only the failed human check needs resetting.
      setCaptchaDone(false);
      setCaptchaWidth(0);
      setSliderKey((k) => k + 1);
      if (!pendingId) resetSmsFlow();
    } finally {
      setSending(false);
    }
  }

  async function onSmsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (smsLoading) return;
    setError(null);
    if (!pendingId) return setError("请先获取验证码。");
    if (!smsCode.trim()) return setError("请输入验证码。");
    setSmsLoading(true);
    try {
      await api.smsVerify(pendingId, smsCode.trim());
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登录失败，请稍后重试。");
      if (err instanceof ApiError && err.code === "WRONG_CODE") {
        setSmsCode("");
        window.setTimeout(() => codeInputRef.current?.focus(), 0);
      }
      if (
        err instanceof ApiError &&
        (err.code === "SESSION_EXPIRED" || err.code === "RATE_LIMITED")
      ) {
        setSliderKey((k) => k + 1);
        resetSmsFlow();
      }
      setSmsLoading(false);
    }
  }

  return (
    <div>
      <Tabs value={tab} onValueChange={(v) => { setTab(v); setError(null); }}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="password">
            <KeyRound className="mr-1.5 h-4 w-4" />
            密码登录
          </TabsTrigger>
          <TabsTrigger value="sms">
            <MessageSquareText className="mr-1.5 h-4 w-4" />
            验证码登录
          </TabsTrigger>
        </TabsList>

        <TabsContent value="password" className="mt-5">
          <form onSubmit={onPasswordSubmit} className="space-y-5" autoComplete="off">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm">教务系统账号</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  placeholder="学号 / 工号"
                  className="pl-9"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={pwLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm">密码</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  className="pl-9 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={pwLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={pwLoading}>
              {pwLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />登录中…
                </>
              ) : (
                <>
                  <GraduationCap className="h-4 w-4" />登录教务系统
                </>
              )}
            </Button>
            <p className="text-center text-xs leading-5 text-muted-foreground">
              登录后会自动保持连接，只有密码变更或学校要求时才需重新登录。
            </p>
          </form>
        </TabsContent>

        <TabsContent value="sms" className="mt-5">
          <form onSubmit={onSmsSubmit} className="space-y-4" autoComplete="off">
            <div className="space-y-2">
              <Label htmlFor="sms-username" className="text-sm">教务系统账号</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="sms-username"
                  autoComplete="username"
                  placeholder="学号 / 工号"
                  className="pl-9"
                  value={smsUsername}
                  onChange={(e) => onSmsUsernameChange(e.target.value)}
                  disabled={sending || smsLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">人机校验</Label>
              <SliderCaptcha
                key={sliderKey}
                disabled={sending || smsLoading}
                onSuccess={(width) => {
                  setCaptchaDone(true);
                  setCaptchaWidth(width);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sms-code" className="text-sm">短信验证码</Label>
              <div className="flex gap-2">
                <Input
                  id="sms-code"
                  ref={codeInputRef}
                  name="one-time-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  placeholder="请输入验证码"
                  className="flex-1"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ""))}
                  disabled={sending || smsLoading}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-32 shrink-0 tabular-nums"
                  onClick={onSendCode}
                  disabled={sending || cooldown > 0 || !captchaDone}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : cooldown > 0 ? (
                    `${cooldown} 秒后重发`
                  ) : (
                    "获取验证码"
                  )}
                </Button>
              </div>
            </div>

            {codeSent && (
              <div className="space-y-2">
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
                    style={{ width: `${cooldownTotal > 0 ? Math.max(0, (cooldown / cooldownTotal) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  {cooldown > 0
                    ? `验证码已发送，${cooldown} 秒后可重新发送。`
                    : "冷却结束，完成人机校验后可重新发送。"}
                </p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={sending || smsLoading || !pendingId || !smsCode.trim()}
            >
              {smsLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />登录中…
                </>
              ) : (
                <>
                  <GraduationCap className="h-4 w-4" />登录教务系统
                </>
              )}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          {error}
        </div>
      )}
    </div>
  );
}
