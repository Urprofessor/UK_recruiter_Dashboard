// Edge-runtime safe（用 Web Crypto，不用 node:crypto）。
// 同时被 middleware（Edge）和 route handler（Node）使用。

const enc = new TextEncoder();

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getPassword(): string {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) {
    throw new Error(
      "DASHBOARD_PASSWORD env var not set. 复制 .env.local.example 为 .env.local 并填一个密码。",
    );
  }
  return pw;
}

export async function makeAuthCookie(): Promise<string> {
  return sha256Hex(getPassword());
}

export async function verifyAuthCookie(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const expected = await makeAuthCookie();
  return value === expected;
}

export function checkPassword(input: string): boolean {
  return input === getPassword();
}

export const AUTH_COOKIE = "dashboard_auth";
