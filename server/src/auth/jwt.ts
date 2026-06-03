import jwt from "jsonwebtoken";
import { env } from "../lib/env.js";

export interface JwtPayload {
  userId: string;
  email: string;
}

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: COOKIE_MAX_AGE_MS,
  path: "/",
};

export const COOKIE_NAME = "access_token";
