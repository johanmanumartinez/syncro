import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshTranscription, startTranscription } from "@/lib/transcription";

// Lee la transcripción (la RLS decide quién puede verla). Si sigue en proceso, la refresca.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: video } = await supabase.from("videos").select("id").eq("id", id).maybeSingle();
  if (!video) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const refreshed = await refreshTranscription(id);
  if (refreshed) return NextResponse.json({ transcript: refreshed });

  const { data } = await supabase.from("transcripts").select("*").eq("video_id", id).maybeSingle();
  return NextResponse.json({ transcript: data });
}

// Renombra hablantes ({ speakers: { A: "Ana" } }) o reintenta ({ retry: true }). Solo el dueño.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: own } = await supabase.from("videos").select("id").eq("id", id).eq("owner_id", auth.user.id).maybeSingle();
  if (!own) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const body = (await req.json()) as { speakers?: Record<string, string>; retry?: boolean };

  if (body.retry) {
    await startTranscription(id);
    return NextResponse.json({ ok: true });
  }

  if (body.speakers) {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.speakers)) {
      if (typeof v === "string" && v.trim()) clean[k] = v.trim().slice(0, 60);
    }
    const { error } = await supabase.from("transcripts").update({ speakers: clean }).eq("video_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
