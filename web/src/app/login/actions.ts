"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, createSession, destroySession, loginAllowed, recordLoginFailure } from "@/lib/session";

export interface LoginState {
  error: string | null;
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const h = await headers();
  const key = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!loginAllowed(key)) return { error: "Too many attempts. Wait a minute and try again." };
  const password = form.get("password");
  if (typeof password !== "string" || !checkPassword(password)) {
    recordLoginFailure(key);
    return { error: "That passphrase is not correct." };
  }
  await createSession();
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
