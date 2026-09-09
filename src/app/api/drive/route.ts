import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/academicAuth";
import { credentialCookieName, openCredentials } from "@/server/auth/credential-token";
import { readSessionId } from "@/server/api-helpers";
import { databaseOwnerKey } from "@/server/database";
import { DriveError, driveConfig, listDrive, removeDriveFile, storeDriveFile } from "@/server/drive";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function ownerKey(req: NextRequest): string | null {
  const account = getSession(readSessionId(req))?.profile?.studentId
    ?? openCredentials(req.cookies.get(credentialCookieName)?.value)?.username;
  return account ? databaseOwnerKey(account) : null;
}

function errorResponse(cause: unknown) {
  if (cause instanceof DriveError) {
    return NextResponse.json({ error: { code: cause.code, message: cause.message } }, { status: cause.status });
  }
  console.error("[drive] operation failed", cause instanceof Error ? { name: cause.name } : { name: "UnknownDriveError" });
  return NextResponse.json({ error: { code: "DRIVE_UNAVAILABLE", message: "云盘暂时不可用。" } }, { status: 503 });
}

function unauthorized() {
  return NextResponse.json({ error: { code: "NOT_CONNECTED", message: "请先连接教务系统。" } }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const owner = ownerKey(req);
  if (!owner) return unauthorized();
  try {
    return NextResponse.json(await listDrive(owner));
  } catch (cause) {
    return errorResponse(cause);
  }
}

export async function POST(req: NextRequest) {
  const owner = ownerKey(req);
  if (!owner) return unauthorized();
  if (!req.body) return NextResponse.json({ error: { code: "EMPTY_FILE", message: "请选择要上传的文件。" } }, { status: 400 });
  const encodedName = req.headers.get("x-file-name");
  if (!encodedName) return NextResponse.json({ error: { code: "INVALID_FILE_NAME", message: "缺少文件名。" } }, { status: 400 });
  let name: string;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    return NextResponse.json({ error: { code: "INVALID_FILE_NAME", message: "文件名无效。" } }, { status: 400 });
  }
  const contentLengthHeader = req.headers.get("content-length");
  const parsedContentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
  const contentLength = parsedContentLength != null && Number.isFinite(parsedContentLength) ? parsedContentLength : undefined;
  if (contentLength != null && contentLength > driveConfig.maxFileBytes) {
    return NextResponse.json({ error: { code: "FILE_TOO_LARGE", message: "文件超过单次上传限制。" } }, { status: 413 });
  }
  try {
    const file = await storeDriveFile(owner, name, req.body, contentLength);
    return NextResponse.json({ ok: true, file }, { status: 201 });
  } catch (cause) {
    return errorResponse(cause);
  }
}

export async function DELETE(req: NextRequest) {
  const owner = ownerKey(req);
  if (!owner) return unauthorized();
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ error: { code: "INVALID_FILE_NAME", message: "缺少文件名。" } }, { status: 400 });
  try {
    await removeDriveFile(owner, name);
    return new NextResponse(null, { status: 204 });
  } catch (cause) {
    return errorResponse(cause);
  }
}
