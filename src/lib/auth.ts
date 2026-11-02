import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
