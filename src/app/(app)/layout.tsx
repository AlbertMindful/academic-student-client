import { AppShell } from "@/components/app-shell";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appSessionCookieName } from "@/server/app-auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  if (!cookieStore.get(appSessionCookieName)?.value) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
