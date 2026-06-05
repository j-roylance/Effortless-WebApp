import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

const BCRYPT_ROUNDS = 12;

export type AuthUser = { id: string; email: string };

/** Email/password auth. User.googleId exists for future OAuth. */
export class LocalProvider {
  async register(email: string, password: string): Promise<AuthUser> {
    const normalized = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      throw Object.assign(new Error("Email already registered"), { status: 409 });
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: { email: normalized, passwordHash },
    });
    return { id: user.id, email: user.email };
  }

  async login(email: string, password: string): Promise<AuthUser> {
    const normalized = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user) {
      throw Object.assign(new Error("Invalid credentials"), { status: 401 });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw Object.assign(new Error("Invalid credentials"), { status: 401 });
    }
    return { id: user.id, email: user.email };
  }
}
