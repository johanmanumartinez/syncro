import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startTranscription } from "@/lib/transcription";

// El cliente avisa que terminó de subir: marca el video como listo y lanza la transcripción.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { durationSeconds?: number };

  const { data: video, error } = await supabase
    .from("videos")
    .update({
      status: "ready",
      duration_seconds: body.durationSeconds ? Math.round(body.durationSeconds) : null,
    })
    .eq("id", id)
    .eq("owner_id", auth.user.id)
    .select("id")
    .maybeSingle();
  if (error || !video) return NextResponse.json({ error: error?.message ?? "No encontrado" }, { status: 404 });

  const admin = createAdminClient();
  await admin.from("transcripts").upsert({ video_id: id, status: "pending" });
  await startTranscription(id).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
