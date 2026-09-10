import crypto from "node:crypto";
import * as cheerio from "cheerio";
import type {
  ChaoxingChatDetailPayload,
  ChaoxingChatGroup,
  ChaoxingChatMessage,
  ChaoxingMessageKind,
  ChaoxingSharedFile,
} from "@/lib/chaoxing-chat-types";
import type { ChaoxingConnection } from "@/server/chaoxing/connection";
import { serverConfig } from "@/server/config";

const IM_HOME = "https://im.chaoxing.com/webim/me";
const EASEMOB_API = "https://a1-vip6.easecdn.com/cx-dev/cxstudy";
const MAX_MESSAGES = 80;

export class ChaoxingChatError extends Error {
  constructor(
    public code: "CHAOXING_REAUTH_REQUIRED" | "CHAT_UNAVAILABLE" | "UPSTREAM_ERROR" | "INVALID_DOWNLOAD",
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = "ChaoxingChatError";
  }
}

interface ImCredentials { token: string; uid: string }
interface DownloadReference {
  kind: "message" | "shared";
  groupId: string;
  name: string;
  url?: string;
  secret?: string;
  fileId?: string;
  expiresAt: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function listFrom(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value;
  const source = record(value);
  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key] as unknown[];
  }
  if (source.data !== value) return listFrom(source.data, keys);
  return [];
}

function safeDate(...values: unknown[]): string | undefined {
  for (const value of values) {
    const raw = numberValue(value);
    if (raw) {
      const date = new Date(raw < 10_000_000_000 ? raw * 1000 : raw);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  }
  return undefined;
}

async function imCredentials(connection: ChaoxingConnection): Promise<ImCredentials> {
  const response = await connection.client.get(IM_HOME);
  const lowerUrl = response.url.toLowerCase();
  if (lowerUrl.includes("passport2.chaoxing.com") || /用户登录|loginform|name=["']uname/i.test(response.body)) {
    throw new ChaoxingChatError("CHAOXING_REAUTH_REQUIRED", "学习通登录已过期，请在“数据来源”中重新连接。", 401);
  }
  if (/系统维护中|功能暂时无法使用/.test(response.body)) {
    throw new ChaoxingChatError("CHAT_UNAVAILABLE", "学习通群聊目前正在维护，请稍后再试。", 503);
  }
  const $ = cheerio.load(response.body);
  const token = $("#myToken").text().trim() || $("#myToken").attr("value")?.trim();
  const uid = connection.cookieValue("UID", IM_HOME)
    ?? $("#myUid").text().trim()
    ?? textValue(response.body.match(/(?:myUid|uid)\s*[:=]\s*["']?(\d{4,})/i)?.[1]);
  if (!token || !uid) {
    throw new ChaoxingChatError("CHAT_UNAVAILABLE", "暂时无法读取学习通群聊，请稍后重试。", 503);
  }
  return { token, uid };
}

async function easemob(path: string, token: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch(path.startsWith("https://") ? path : `${EASEMOB_API}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (response.status === 401 || response.status === 403) {
      throw new ChaoxingChatError("CHAOXING_REAUTH_REQUIRED", "学习通群聊授权已过期，请重新连接学习通。", 401);
    }
    if (!response.ok) throw new ChaoxingChatError("UPSTREAM_ERROR", "学习通群聊暂时无法访问，请稍后重试。", 502);
    return response;
  } catch (cause) {
    if (cause instanceof ChaoxingChatError) throw cause;
    throw new ChaoxingChatError("UPSTREAM_ERROR", "连接学习通群聊超时，请稍后重试。", 504);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeGroup(value: unknown): ChaoxingChatGroup | null {
  const item = record(value);
  const id = textValue(item.groupid, item.groupId, item.id, item.chatGroupId);
  if (!id) return null;
  return {
    id,
    name: textValue(item.groupname, item.groupName, item.name, item.title) ?? `群聊 ${id.slice(-6)}`,
    description: textValue(item.description, item.desc),
    memberCount: numberValue(item.affiliations_count, item.affiliationsCount, item.memberCount),
  };
}

export async function getChaoxingChatGroups(connection: ChaoxingConnection): Promise<ChaoxingChatGroup[]> {
  const credentials = await imCredentials(connection);
  const response = await easemob(`/users/${encodeURIComponent(credentials.uid)}/joined_chatgroups`, credentials.token);
  const body = await response.json() as unknown;
  const groups = listFrom(body, ["entities", "groups", "chatgroups"])
    .map(normalizeGroup)
    .filter((group): group is ChaoxingChatGroup => Boolean(group));
  return Array.from(new Map(groups.map((group) => [group.id, group])).values())
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

class ProtoReader {
  position = 0;
  constructor(public bytes: Uint8Array) {}
  get done() { return this.position >= this.bytes.length; }
  varint(): number {
    let value = 0;
    let multiplier = 1;
    while (!this.done && multiplier <= 2 ** 63) {
      const byte = this.bytes[this.position++];
      value += (byte & 0x7f) * multiplier;
      if (!(byte & 0x80)) return value;
      multiplier *= 128;
    }
    throw new Error("Invalid protobuf varint");
  }
  chunk(): Uint8Array {
    const length = this.varint();
    const end = this.position + length;
    if (end > this.bytes.length) throw new Error("Invalid protobuf length");
    const result = this.bytes.subarray(this.position, end);
    this.position = end;
    return result;
  }
  string(): string { return new TextDecoder().decode(this.chunk()); }
  skip(wire: number): void {
    if (wire === 0) void this.varint();
    else if (wire === 1) this.position += 8;
    else if (wire === 2) void this.chunk();
    else if (wire === 5) this.position += 4;
    else throw new Error("Unsupported protobuf wire type");
    if (this.position > this.bytes.length) throw new Error("Invalid protobuf field");
  }
}

interface DecodedContent {
  type: number;
  text?: string;
  displayName?: string;
  remotePath?: string;
  secretKey?: string;
  fileLength?: number;
}
interface DecodedBody {
  from?: string;
  contents: DecodedContent[];
  ext: Record<string, unknown>;
}

function decodeJid(bytes: Uint8Array): string | undefined {
  const reader = new ProtoReader(bytes);
  let name: string | undefined;
  while (!reader.done) {
    const tag = reader.varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 2 && wire === 2) name = reader.string(); else reader.skip(wire);
  }
  return name;
}

function decodeKeyValue(bytes: Uint8Array): [string, unknown] | null {
  const reader = new ProtoReader(bytes);
  let key = "";
  let type = 0;
  let value: unknown;
  while (!reader.done) {
    const tag = reader.varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) key = reader.string();
    else if (field === 2 && wire === 0) type = reader.varint();
    else if (field === 3 && wire === 0) value = reader.varint();
    else if (field === 6 && wire === 2) value = reader.string();
    else reader.skip(wire);
  }
  if (!key) return null;
  if (typeof value === "string" && type === 8) {
    try { value = JSON.parse(value); } catch { /* Keep original text. */ }
  }
  return [key, value];
}

function decodeContent(bytes: Uint8Array): DecodedContent {
  const reader = new ProtoReader(bytes);
  const content: DecodedContent = { type: 0 };
  while (!reader.done) {
    const tag = reader.varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 0) content.type = reader.varint();
    else if (field === 2 && wire === 2) content.text = reader.string();
    else if (field === 6 && wire === 2) content.displayName = reader.string();
    else if (field === 7 && wire === 2) content.remotePath = reader.string();
    else if (field === 8 && wire === 2) content.secretKey = reader.string();
    else if (field === 9 && wire === 0) content.fileLength = reader.varint();
    else reader.skip(wire);
  }
  return content;
}

function decodeBody(bytes: Uint8Array): DecodedBody {
  const reader = new ProtoReader(bytes);
  const body: DecodedBody = { contents: [], ext: {} };
  while (!reader.done) {
    const tag = reader.varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 2 && wire === 2) body.from = decodeJid(reader.chunk());
    else if (field === 4 && wire === 2) body.contents.push(decodeContent(reader.chunk()));
    else if (field === 5 && wire === 2) {
      const pair = decodeKeyValue(reader.chunk());
      if (pair) body.ext[pair[0]] = pair[1];
    } else reader.skip(wire);
  }
  return body;
}

function decodeMeta(encoded: string): { id: string; timestamp: number; body: DecodedBody } | null {
  try {
    const reader = new ProtoReader(Buffer.from(encoded, "base64"));
    let id = "";
    let timestamp = 0;
    let namespace = 0;
    let payload: Uint8Array | undefined;
    while (!reader.done) {
      const tag = reader.varint();
      const field = tag >>> 3;
      const wire = tag & 7;
      if (field === 1 && wire === 0) id = reader.varint().toString();
      else if (field === 4 && wire === 0) timestamp = reader.varint();
      else if (field === 5 && wire === 0) namespace = reader.varint();
      else if (field === 6 && wire === 2) payload = reader.chunk();
      else reader.skip(wire);
    }
    if (!payload || (namespace !== 0 && namespace !== 1)) return null;
    return { id: id || crypto.randomUUID(), timestamp, body: decodeBody(payload) };
  } catch { return null; }
}

function deepText(value: unknown, names: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = record(value);
  for (const name of names) {
    const found = textValue(source[name]);
    if (found) return found;
  }
  for (const nested of Object.values(source)) {
    const found = deepText(nested, names);
    if (found) return found;
  }
  return undefined;
}

function encryptionKey(): Buffer {
  return crypto.createHash("sha256").update(`${serverConfig.sessionSecret || "local-development"}:chaoxing-chat-download`).digest();
}

function sealDownload(reference: DownloadReference): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(reference), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function openChatDownload(token: string): DownloadReference {
  try {
    const packed = Buffer.from(token, "base64url");
    if (packed.length < 29) throw new Error("short token");
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    const value = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8")) as DownloadReference;
    if (!value.groupId || !value.name || value.expiresAt < Date.now()) throw new Error("expired token");
    return value;
  } catch {
    throw new ChaoxingChatError("INVALID_DOWNLOAD", "下载链接已失效，请返回消息页面重试。", 400);
  }
}

function messageKind(type: number): ChaoxingMessageKind {
  return ({ 0: "text", 1: "image", 2: "video", 4: "voice", 5: "file" } as Record<number, ChaoxingMessageKind>)[type] ?? "other";
}

function normalizeMessage(raw: unknown, groupId: string): ChaoxingChatMessage | null {
  const source = record(raw);
  const encoded = textValue(source.msg, source.message);
  if (!encoded) return null;
  const meta = decodeMeta(encoded);
  if (!meta) return null;
  const content = meta.body.contents[0];
  if (!content) return null;
  const senderName = deepText(meta.body.ext, ["nickname", "nickName", "fromNick", "name", "personName", "userName"])
    ?? meta.body.from ?? "学习通用户";
  const activityText = deepText(meta.body.ext, ["title", "content", "description"]);
  let kind = messageKind(content.type);
  if (kind === "other" && activityText) kind = "activity";
  const sentAt = safeDate(meta.timestamp) ?? safeDate(source.timestamp) ?? new Date().toISOString();
  const message: ChaoxingChatMessage = {
    id: crypto.createHash("sha1").update(encoded).digest("hex"),
    senderId: meta.body.from ?? "",
    senderName,
    sentAt,
    kind,
    text: content.text ?? activityText,
  };
  if (["file", "image", "video", "voice"].includes(kind) && content.remotePath) {
    message.attachment = {
      name: content.displayName ?? `${kind}-${meta.id}`,
      size: content.fileLength,
      kind: kind as "file" | "image" | "video" | "voice",
      downloadToken: sealDownload({
        kind: "message", groupId, name: content.displayName ?? `attachment-${meta.id}`,
        url: content.remotePath, secret: content.secretKey, expiresAt: Date.now() + 30 * 60_000,
      }),
    };
  }
  return message;
}

function normalizeSharedFile(raw: unknown, groupId: string): ChaoxingSharedFile | null {
  const item = record(raw);
  const id = textValue(item.file_id, item.fileId, item.id, item.uuid);
  const name = textValue(item.file_name, item.fileName, item.name, item.filename);
  if (!id || !name) return null;
  return {
    id,
    name,
    size: numberValue(item.file_size, item.fileSize, item.size),
    uploadedAt: safeDate(item.created, item.createdAt, item.timestamp, item.uploadTime),
    ownerName: textValue(item.owner_name, item.ownerName, item.username),
    downloadToken: sealDownload({ kind: "shared", groupId, fileId: id, name, expiresAt: Date.now() + 30 * 60_000 }),
  };
}

export async function getChaoxingChatDetail(connection: ChaoxingConnection, groupId: string): Promise<ChaoxingChatDetailPayload> {
  if (!/^[\w-]{1,100}$/.test(groupId)) throw new ChaoxingChatError("UPSTREAM_ERROR", "群聊编号无效。", 400);
  const credentials = await imCredentials(connection);
  const [groupResponse, messagesResponse, filesResult] = await Promise.all([
    easemob(`/chatgroups/${encodeURIComponent(groupId)}?joined_time=true`, credentials.token),
    easemob(`/users/${encodeURIComponent(credentials.uid)}/messageroaming`, credentials.token, {
      method: "POST",
      body: JSON.stringify({ queue: `${groupId}@conference.easemob.com`, start: -1, end: -1 }),
    }),
    easemob(`/chatgroups/${encodeURIComponent(groupId)}/share_files`, credentials.token).catch(() => null),
  ]);
  const [groupBody, messagesBody, filesBody] = await Promise.all([
    groupResponse.json() as Promise<unknown>,
    messagesResponse.json() as Promise<unknown>,
    filesResult ? filesResult.json() as Promise<unknown> : Promise.resolve(null),
  ]);
  const groupCandidate = listFrom(groupBody, ["entities", "groups", "chatgroups"])[0] ?? record(groupBody).data;
  const group = normalizeGroup(groupCandidate) ?? { id: groupId, name: `群聊 ${groupId.slice(-6)}` };
  const messages = listFrom(messagesBody, ["msgs", "messages", "entities"])
    .slice(-MAX_MESSAGES)
    .map((item) => normalizeMessage(item, groupId))
    .filter((item): item is ChaoxingChatMessage => Boolean(item))
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const files = listFrom(filesBody, ["entities", "files", "share_files"])
    .map((item) => normalizeSharedFile(item, groupId))
    .filter((item): item is ChaoxingSharedFile => Boolean(item));
  return { group, messages, files };
}

export async function downloadChaoxingChatFile(
  connection: ChaoxingConnection,
  reference: DownloadReference,
  range?: string | null,
): Promise<Response> {
  const credentials = await imCredentials(connection);
  let url: string;
  const headers: Record<string, string> = { Accept: "application/octet-stream" };
  if (range) headers.Range = range;
  if (reference.kind === "shared") {
    if (!reference.fileId) throw new ChaoxingChatError("INVALID_DOWNLOAD", "文件信息不完整。", 400);
    url = `${EASEMOB_API}/chatgroups/${encodeURIComponent(reference.groupId)}/share_files/${encodeURIComponent(reference.fileId)}`;
  } else {
    if (!reference.url) throw new ChaoxingChatError("INVALID_DOWNLOAD", "文件信息不完整。", 400);
    const parsed = new URL(reference.url);
    if (parsed.protocol !== "https:" || !(parsed.hostname === "a1-vip6.easecdn.com" || parsed.hostname.endsWith(".easecdn.com"))) {
      throw new ChaoxingChatError("INVALID_DOWNLOAD", "文件来源不受信任。", 400);
    }
    url = parsed.toString();
    if (reference.secret) headers["share-secret"] = reference.secret;
  }
  return easemob(url, credentials.token, { headers });
}
