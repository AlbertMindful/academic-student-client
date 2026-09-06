export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ commit: process.env.RENDER_GIT_COMMIT ?? "local" });
}
