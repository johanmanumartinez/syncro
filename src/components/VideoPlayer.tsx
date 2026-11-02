"use client";

import { useEffect, useRef, useState } from "react";
import { formatMs } from "@/lib/format";
import type { Transcript } from "@/lib/types";

const COLORS = [
  "text-indigo-600 dark:text-indigo-400",
  "text-emerald-600 dark:text-emerald-400",
  "text-amber-600 dark:text-amber-400",
  "text-rose-600 dark:text-rose-400",
  "text-cyan-600 dark:text-cyan-400",
  "text-fuchsia-600 dark:text-fuchsia-400",
];

type Props = {
  videoId: string;
  src: string;
  title: string;
  isOwner: boolean;
  showTranscript?: boolean;
};

export default function VideoPlayer({ videoId, src, title, isOwner, showTranscript = true }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [names, setNames] = useState<Record<string, string>>({});

  // Los .webm grabados en el navegador no traen duración: se fuerza a calcularla para poder usar la barra.
  function fixDuration() {
    const v = videoRef.current;
    if (!v || v.duration !== Infinity) return;
    const onUpdate = () => {
      v.removeEventListener("timeupdate", onUpdate);
      v.currentTime = 0;
    };
    v.addEventListener("timeupdate", onUpdate);
    v.currentTime = 1e101;
  }

  // Carga y sondeo de la transcripción mientras esté en proceso.
  useEffect(() => {
    if (!showTranscript) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function load() {
      try {
        const res = await fetch(`/api/videos/${videoId}/transcript`, { cache: "no-store" });
        if (!res.ok) return;
        const { transcript: t } = (await res.json()) as { transcript: Transcript | null };
        if (cancelled) return;
        setTranscript(t);
        setLoaded(true);
        setNames((prev) => (Object.keys(prev).length ? prev : (t?.speakers ?? {})));
        if (!t || t.status === "pending" || t.status === "processing") timer = setTimeout(load, 5000);
      } catch {
        if (!cancelled) timer = setTimeout(load, 8000);
      }
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [videoId, showTranscript]);

  const speakerIds = [...new Set(transcript?.utterances.map((u) => u.speaker) ?? [])].sort();
  const label = (id: string) => names[id]?.trim() || `Hablante ${id}`;
  const color = (id: string) => COLORS[speakerIds.indexOf(id) % COLORS.length];
  const activeIndex = transcript?.utterances.findIndex((u) => currentMs >= u.start && currentMs < Math.max(u.end, u.start + 1)) ?? -1;

  function seek(ms: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = ms / 1000;
    void v.play();
  }

  async function saveNames() {
    await fetch(`/api/videos/${videoId}/transcript`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ speakers: names }),
    });
  }

  async function retry() {
    await fetch(`/api/videos/${videoId}/transcript`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ retry: true }),
    });
    setTranscript(null);
    setLoaded(false);
    location.reload();
  }

  function download() {
    if (!transcript) return;
    const text = transcript.utterances.map((u) => `[${formatMs(u.start)}] ${label(u.speaker)}: ${u.text}`).join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <video
        ref={videoRef}
        src={src}
        controls
        playsInline
        onLoadedMetadata={fixDuration}
        onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
        className="aspect-video w-full rounded-xl bg-black"
      />

      {showTranscript && (
        <aside className="card flex max-h-[34rem] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="text-sm font-semibold">Transcripción</h2>
            {transcript?.status === "done" && transcript.utterances.length > 0 && (
              <button onClick={download} className="text-xs text-indigo-600 hover:underline">Descargar .txt</button>
            )}
          </div>

          {isOwner && speakerIds.length > 1 && (
            <div className="space-y-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <p className="text-xs text-zinc-500">Nombra a cada hablante:</p>
              {speakerIds.map((id) => (
                <input
                  key={id}
                  value={names[id] ?? ""}
                  onChange={(e) => setNames((n) => ({ ...n, [id]: e.target.value }))}
                  onBlur={saveNames}
                  placeholder={`Hablante ${id}`}
                  className="input py-1"
                />
              ))}
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {!loaded && <p className="text-zinc-500">Cargando…</p>}
            {loaded && (!transcript || transcript.status === "pending" || transcript.status === "processing") && (
              <p className="text-zinc-500">Transcribiendo… esto puede tardar unos minutos.</p>
            )}
            {transcript?.status === "error" && (
              <div className="space-y-2">
                <p className="text-red-600">No se pudo transcribir: {transcript.error}</p>
                {isOwner && <button onClick={retry} className="btn-ghost">Reintentar</button>}
              </div>
            )}
            {transcript?.status === "done" && transcript.utterances.length === 0 && (
              <p className="text-zinc-500">No se detectó voz en este video.</p>
            )}
            {transcript?.status === "done" &&
              transcript.utterances.map((u, i) => (
                <button
                  key={i}
                  onClick={() => seek(u.start)}
                  className={`block w-full rounded-lg p-2 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800 ${i === activeIndex ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}
                >
                  <div className="mb-0.5 flex items-center gap-2 text-xs">
                    <span className={`font-semibold ${color(u.speaker)}`}>{label(u.speaker)}</span>
                    <span className="text-zinc-400">{formatMs(u.start)}</span>
                  </div>
                  <p>{u.text}</p>
                </button>
              ))}
          </div>
        </aside>
      )}
    </div>
  );
}
