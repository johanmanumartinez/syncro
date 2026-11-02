import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Cancela una reunión que aún no terminó (el bot sale al detectar el cambio de estado).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { error } = await supabase
    .from("meetings")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .in("status", ["queued", "joining", "waiting_admit", "recording"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
