"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { StudentProfile } from "@/lib/types";
import { api } from "@/lib/api-client";

export type AuthState = "loading" | "authenticated" | "unauthenticated";

export function useSession() {
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
        }
      })
      .catch(() => {
        if (cancelled) return;
        setState("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { state, profile };
}

export function useRequireAuth() {
  const session = useSession();
  const router = useRouter();
  React.useEffect(() => {
    if (session.state === "unauthenticated") router.replace("/login");
  }, [router, session.state]);
  return session;
}
