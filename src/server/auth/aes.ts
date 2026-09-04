import crypto from "node:crypto";

/**
 * 复现学校官方登录页对密码的客户端加密：
 * CryptoJS.AES.encrypt(text, CryptoJS.enc.Utf8.parse(key),
 *   { mode: ECB, padding: Pkcs7 }).toString()
 *
 * 即 AES-128-ECB + PKCS7 填充 + Base64。密钥来自登录页公开 JS
 * （loginData.key），属于官方客户端处理，不是服务端密钥破解。
 */
export function aesEcbEncryptBase64(plaintext: string, keyUtf8: string): string {
  const key = Buffer.from(keyUtf8, "utf8");
  // 密钥长度必须为 16/24/32 字节（AES-128/192/256）
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(true); // PKCS7
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return encrypted.toString("base64");
}

/** 生成随机设备标识（复现登录页的 Math.uuid()）。 */
export function randomUuid(): string {
  return crypto.randomUUID();
}
