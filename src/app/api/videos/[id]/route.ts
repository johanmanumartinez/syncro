import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Título, permisos y lista de correos permitidos.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = (await req.json()) as { title?: string; visibility?: string; emails?: string[] };
  const patch: Record<string, string> = {};
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (body.visibility && ["private", "public", "restricted"].includes(body.visibility)) {
    patch.visibility = body.visibility;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("videos").update(patch).eq("id", id).eq("owner_id", auth.user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (Array.isArray(body.emails)) {
    const emails = [...new Set(body.emails.map((e) => e.trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
    // Verifica que el video es del usuario antes de tocar la lista.
    const { data: own } = await supabase.from("videos").select("id").eq("id", id).eq("owner_id", auth.user.id).maybeSingle();
    if (!own) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    await supabase.from("video_shares").delete().eq("video_id", id);
    if (emails.length > 0) {
      const { error } = await supabase
        .from("video_shares")
        .insert(emails.map((email) => ({ video_id: id, owner_id: auth.user!.id, email })));
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: video } = await supabase
    .from("videos")
    .select("storage_path")
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (!video) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  await createAdminClient().storage.from(BUCKET).remove([video.storage_path]);
  const { error } = await supabase.from("videos").delete().eq("id", id).eq("owner_id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
