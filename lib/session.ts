// Demo role switcher (plan Section 4.1: no real auth). The current persona is a cookie holding a seeded user id.

import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "p2p_user";

/** Personas offered in the switcher, in display order. */
export const PERSONA_EMAILS = [
  "rahul@marina-exports.example",
  "dinesh@example-freight.example",
  "laura@northwind-imports.example",
  "meena@kaveri-auto.example",
  "kavitha@marina-exports.example",
];

export async function listPersonas() {
  const users = await db.user.findMany({ where: { email: { in: PERSONA_EMAILS } }, include: { business: true } });
  return PERSONA_EMAILS.map((email) => users.find((user) => user.email === email)).filter((user) => user !== undefined);
}

/** The signed-in persona, defaulting to the exporter. */
export async function currentUser() {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = id ? await db.user.findUnique({ where: { id }, include: { business: true } }) : null;
  return user ?? db.user.findFirstOrThrow({ where: { email: PERSONA_EMAILS[0] }, include: { business: true } });
}

export type SessionUser = Awaited<ReturnType<typeof currentUser>>;

/** Operators (exporter staff) approve agent actions. */
export const canApprove = (user: SessionUser) => user.role === "MANAGER" || user.role === "EXPORTER";
