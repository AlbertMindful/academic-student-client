import { mkdir, open, readdir, rename, stat, statfs, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { DriveFile, DriveSummary } from "@/lib/drive-types";

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const MAX_FILES = 1_000;

type DriveGlobal = typeof globalThis & { __academicDriveLock?: Promise<void> };
const driveGlobal = globalThis as DriveGlobal;

export class DriveError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

function bytesFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export const driveConfig = {
  root: process.env.DRIVE_STORAGE_PATH?.trim() || (process.env.NODE_ENV === "production"
    ? "/var/lib/academic-student-drive"
    : path.join(os.tmpdir(), "academic-student-drive")),
  quotaBytes: bytesFromEnv("DRIVE_QUOTA_BYTES", 8 * GIB),
  reserveBytes: bytesFromEnv("DRIVE_RESERVE_BYTES", 8 * GIB),
  maxFileBytes: bytesFromEnv("DRIVE_MAX_FILE_BYTES", 200 * MIB),
};

function safeName(input: string): string {
  const normalized = input.normalize("NFC").trim();
  if (!normalized || normalized === "." || normalized === "..") {
    throw new DriveError("INVALID_FILE_NAME", "文件名无效。", 400);
  }
  if (normalized !== path.basename(normalized) || /[\\/\0-\x1f\x7f]/.test(normalized)) {
    throw new DriveError("INVALID_FILE_NAME", "文件名包含不支持的字符。", 400);
  }
  const cleaned = normalized.replace(/^\.+/, "").slice(0, 180).trim();
  if (!cleaned) throw new DriveError("INVALID_FILE_NAME", "文件名无效。", 400);
  return cleaned;
}

function ownerDirectory(ownerKey: string): string {
  if (!/^[a-f0-9]{64}$/.test(ownerKey)) throw new DriveError("INVALID_OWNER", "账号信息无效。", 400);
  return path.join(driveConfig.root, ownerKey);
}

async function directorySize(directory: string): Promise<number> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT") return [];
    throw cause;
  });
  let total = 0;
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(target);
    else if (entry.isFile() && !entry.isSymbolicLink()) total += await stat(target).then((info) => info.size);
  }
  return total;
}

async function capacity(ownerKey: string): Promise<Omit<DriveSummary, "files">> {
  await mkdir(driveConfig.root, { recursive: true, mode: 0o750 });
  const [disk, usedBytes, globalUsedBytes] = await Promise.all([
    statfs(driveConfig.root),
    directorySize(ownerDirectory(ownerKey)),
    directorySize(driveConfig.root),
  ]);
  const freeBytes = disk.bavail * disk.bsize;
  const availableBytes = Math.max(0, Math.min(
    driveConfig.quotaBytes - usedBytes,
    driveConfig.quotaBytes - globalUsedBytes,
    freeBytes - driveConfig.reserveBytes,
  ));
  return {
    usedBytes,
    quotaBytes: driveConfig.quotaBytes,
    availableBytes,
    maxFileBytes: driveConfig.maxFileBytes,
  };
}

async function withDriveLock<T>(action: () => Promise<T>): Promise<T> {
  const previous = driveGlobal.__academicDriveLock ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  driveGlobal.__academicDriveLock = previous.then(() => gate);
  await previous;
  try {
    return await action();
  } finally {
    release();
  }
}

async function availableName(directory: string, requested: string): Promise<string> {
  const extension = path.extname(requested);
  const stem = requested.slice(0, requested.length - extension.length);
  for (let index = 1; index <= 999; index += 1) {
    const suffix = index === 1 ? "" : ` (${index})`;
    const candidate = `${stem.slice(0, Math.max(1, 180 - extension.length - suffix.length))}${suffix}${extension}`;
    try {
      const handle = await open(path.join(directory, candidate), "wx", 0o640);
      await handle.close();
      await unlink(path.join(directory, candidate));
      return candidate;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
    }
  }
  throw new DriveError("TOO_MANY_DUPLICATES", "同名文件过多，请修改文件名后重试。", 409);
}

export async function listDrive(ownerKey: string): Promise<DriveSummary> {
  const directory = ownerDirectory(ownerKey);
  await mkdir(directory, { recursive: true, mode: 0o750 });
  const entries = await readdir(directory, { withFileTypes: true });
  const files = (await Promise.all(entries
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && !entry.name.startsWith("."))
    .map(async (entry): Promise<DriveFile> => {
      const info = await stat(path.join(directory, entry.name));
      return { name: entry.name, size: info.size, modifiedAt: info.mtime.toISOString() };
    })))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return { files, ...(await capacity(ownerKey)) };
}

export async function storeDriveFile(
  ownerKey: string,
  requestedName: string,
  body: ReadableStream<Uint8Array>,
  declaredSize?: number,
): Promise<DriveFile> {
  return withDriveLock(async () => {
    const directory = ownerDirectory(ownerKey);
    await mkdir(directory, { recursive: true, mode: 0o750 });
    const currentFiles = await readdir(directory, { withFileTypes: true });
    if (currentFiles.filter((entry) => entry.isFile() && !entry.name.startsWith(".")).length >= MAX_FILES) {
      throw new DriveError("FILE_LIMIT_REACHED", `云盘最多保存 ${MAX_FILES} 个文件。`, 409);
    }
    const limits = await capacity(ownerKey);
    if (declaredSize != null && declaredSize > driveConfig.maxFileBytes) {
      throw new DriveError("FILE_TOO_LARGE", "文件超过单次上传限制。", 413);
    }
    if (declaredSize != null && declaredSize > limits.availableBytes) {
      throw new DriveError("INSUFFICIENT_SPACE", "云盘剩余空间不足。", 413);
    }

    const name = await availableName(directory, safeName(requestedName));
    const temporary = path.join(directory, `.upload-${crypto.randomUUID()}.tmp`);
    const handle = await open(temporary, "wx", 0o640);
    const reader = body.getReader();
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > driveConfig.maxFileBytes) throw new DriveError("FILE_TOO_LARGE", "文件超过单次上传限制。", 413);
        if (size > limits.availableBytes) throw new DriveError("INSUFFICIENT_SPACE", "云盘剩余空间不足。", 413);
        await handle.write(value);
      }
      if (size === 0) throw new DriveError("EMPTY_FILE", "不能上传空文件。", 400);
      await handle.sync();
      await handle.close();
      const target = path.join(directory, name);
      await rename(temporary, target);
      const info = await stat(target);
      return { name, size: info.size, modifiedAt: info.mtime.toISOString() };
    } catch (cause) {
      await handle.close().catch(() => undefined);
      await unlink(temporary).catch(() => undefined);
      throw cause;
    } finally {
      reader.releaseLock();
    }
  });
}

export async function removeDriveFile(ownerKey: string, requestedName: string): Promise<void> {
  await withDriveLock(async () => {
    const target = driveFilePath(ownerKey, requestedName);
    await unlink(target).catch((cause: NodeJS.ErrnoException) => {
      if (cause.code === "ENOENT") throw new DriveError("FILE_NOT_FOUND", "文件不存在。", 404);
      throw cause;
    });
  });
}

export function driveFilePath(ownerKey: string, requestedName: string): string {
  return path.join(ownerDirectory(ownerKey), safeName(requestedName));
}
