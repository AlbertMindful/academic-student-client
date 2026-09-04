"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { StudentProfile } from "@/lib/types";
import { api } from "@/lib/api-client";

export type AuthState = "loading" | "authenticated" | "unauthenticated";

export function useRequireAuth() {
  const router = useRouter();
  const [state, setState] = React.useState<AuthState>("loading");
  const [profile, setProfile] = React.useState<StudentProfile | undefined>();

  React.useEffect(() => {
    let cancelled = false;
    api
      .getSession()
      .then((s) => {
        if (cancelled) return;
        if (s.authenticated) {
          setProfile(s.profile);
          setState("authenticated");
        } else {
          setState("unauthenticated");
          router.replace("/login");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState("unauthenticated");
        router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { state, profile };
}
