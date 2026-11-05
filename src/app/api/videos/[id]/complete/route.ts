import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startTranscription } from "@/lib/transcription";
import { getUserFromRequest, CORS_HEADERS } from "@/lib/supabase/token-auth";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// El cliente avisa que terminó de subir: marca el video como listo y lanza la transcripción.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: CORS_HEADERS });

  const body = (await req.json().catch(() => ({}))) as { durationSeconds?: number };

  const admin = createAdminClient();
  const { data: video, error } = await admin
    .from("videos")
    .update({
      status: "ready",
      duration_seconds: body.durationSeconds ? Math.round(body.durationSeconds) : null,
    })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  if (error || !video) return NextResponse.json({ error: error?.message ?? "No encontrado" }, { status: 404, headers: CORS_HEADERS });

  await admin.from("transcripts").upsert({ video_id: id, status: "pending" });
  await startTranscription(id).catch(() => undefined);

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
