import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, type Utterance } from "@/lib/types";

const API = "https://api.assemblyai.com/v2";

type AssemblyTranscript = {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  error?: string;
  language_code?: string;
  utterances?: { speaker: string; start: number; end: number; text: string }[] | null;
  text?: string | null;
};

function headers() {
  return { authorization: process.env.ASSEMBLYAI_API_KEY!, "content-type": "application/json" };
}

async function setTranscript(videoId: string, patch: Record<string, unknown>) {
  const admin = createAdminClient();
  await admin
    .from("transcripts")
    .upsert({ video_id: videoId, ...patch, updated_at: new Date().toISOString() });
}

/** Lanza la transcripción (con diarización) de un video ya subido. */
export async function startTranscription(videoId: string) {
  const admin = createAdminClient();

  if (!process.env.ASSEMBLYAI_API_KEY) {
    await setTranscript(videoId, { status: "error", error: "Falta ASSEMBLYAI_API_KEY en el servidor." });
    return;
  }

  const { data: video } = await admin.from("videos").select("storage_path").eq("id", videoId).single();
  if (!video) return;

  const { data: signed, error: signError } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(video.storage_path, 60 * 60 * 24);
  if (signError || !signed) {
    await setTranscript(videoId, { status: "error", error: signError?.message ?? "No se pudo firmar la URL." });
    return;
  }

  const res = await fetch(`${API}/transcript`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      audio_url: signed.signedUrl,
      speaker_labels: true,
      language_detection: true,
    }),
  });
  const body = (await res.json()) as AssemblyTranscript & { error?: string };

  if (!res.ok) {
    await setTranscript(videoId, { status: "error", error: body.error ?? `AssemblyAI respondió ${res.status}` });
    return;
  }
  await setTranscript(videoId, { status: "processing", provider_id: body.id, error: null });
}

/** Si la transcripción sigue en curso, consulta al proveedor y guarda el resultado. */
export async function refreshTranscription(videoId: string) {
  const admin = createAdminClient();
  const { data: t } = await admin.from("transcripts").select("*").eq("video_id", videoId).maybeSingle();
  if (!t || t.status !== "processing" || !t.provider_id) return t;

  const res = await fetch(`${API}/transcript/${t.provider_id}`, { headers: headers() });
  const body = (await res.json()) as AssemblyTranscript;

  if (body.status === "completed") {
    // Sin diarización (un solo hablante o audio sin voz) → un único bloque.
    const utterances: Utterance[] =
      body.utterances && body.utterances.length > 0
        ? body.utterances.map((u) => ({ speaker: u.speaker, start: u.start, end: u.end, text: u.text }))
        : body.text
          ? [{ speaker: "A", start: 0, end: 0, text: body.text }]
          : [];
    await setTranscript(videoId, { status: "done", utterances, language: body.language_code ?? null, error: null });
  } else if (body.status === "error") {
    await setTranscript(videoId, { status: "error", error: body.error ?? "Error de transcripción" });
  }

  const { data: fresh } = await admin.from("transcripts").select("*").eq("video_id", videoId).maybeSingle();
  return fresh;
}
