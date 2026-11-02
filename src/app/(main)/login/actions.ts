"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; info?: string };

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if (error) return { error: "Correo o contraseña incorrectos." };
  redirect("/library");
}

export async function signUp(_prev: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(form.get("email") ?? ""),
    password,
  });
  if (error) return { error: error.message };
  if (!data.session) return { info: "Revisa tu correo para confirmar la cuenta y luego inicia sesión." };
  redirect("/library");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
