"use server";

import { cookies } from "next/headers";
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { adminUsers } from "./schema";

const COOKIE_NAME = "sw_pwa";
const SESSION_TTL_S = 60 * 60 * 8; // 8 hours
const SCRYPT_KEYLEN = 32;

function getSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "ADMIN_SESSION_SECRET is missing or too short (need ≥16 chars).",
    );
  }
  return s;
}

function getEnvCreds(): { username: string; password: string } | null {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  const username = process.env.ADMIN_USERNAME ?? "admin";
  return { username, password };
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPasswordHash(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[1], "hex");
    expected = Buffer.from(parts[2], "hex");
  } catch {
    return false;
  }
  let computed: Buffer;
  try {
    computed = scryptSync(plain, salt, expected.length);
  } catch {
    return false;
  }
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function constantEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function buildToken(username: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const payload = `${username}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): { username: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [username, expStr, sig] = parts;
  const payload = `${username}.${expStr}`;
  let expected: string;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  if (!constantEq(sig, expected)) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  return { username };
}

export async function currentPwaUser(): Promise<string | null> {
  const jar = await cookies();
  const verified = verifyToken(jar.get(COOKIE_NAME)?.value);
  return verified?.username ?? null;
}

export async function isPwaAuthed(): Promise<boolean> {
  return (await currentPwaUser()) !== null;
}

export async function requirePwa(): Promise<void> {
  if (!(await isPwaAuthed())) {
    throw new Error("Please sign in on the tablet to submit feedback.");
  }
}

export type LoginResult = { ok: true; username: string } | { ok: false; error: string };

async function tryDbLogin(
  username: string,
  password: string,
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.username, username))
    .limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!verifyPasswordHash(password, row.passwordHash)) return null;
  return row.username;
}

async function tryEnvLogin(
  username: string,
  password: string,
): Promise<string | null> {
  const env = getEnvCreds();
  if (!env) return null;
  if (!constantEq(username, env.username)) return null;
  if (!constantEq(password, env.password)) return null;
  return env.username;
}

export async function loginPwa(
  username: string,
  password: string,
): Promise<LoginResult> {
  const u = (username ?? "").trim();
  const p = password ?? "";
  if (!u || !p) {
    return { ok: false, error: "Please enter username and password." };
  }
  const matched =
    (await tryDbLogin(u, p)) ?? (await tryEnvLogin(u, p));
  if (!matched) {
    return { ok: false, error: "Invalid username or password." };
  }
  const jar = await cookies();
  jar.set(COOKIE_NAME, buildToken(matched), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
  return { ok: true, username: matched };
}

export async function logoutPwa(): Promise<{ ok: true }> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  return { ok: true };
}
