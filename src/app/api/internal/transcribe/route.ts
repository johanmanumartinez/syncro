import { NextResponse } from "next/server";
import { startTranscription } from "@/lib/transcription";

// Lo llama el bot de reuniones al terminar de subir la grabación.
export async function POST(req: Request) {
  const secret = process.env.BOT_SECRET;
  if (!secret || req.headers.get("x-bot-secret") !== secret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { videoId } = (await req.json()) as { videoId?: string };
  if (!videoId) return NextResponse.json({ error: "Falta videoId" }, { status: 400 });

  await startTranscription(videoId);
  return NextResponse.json({ ok: true });
}
