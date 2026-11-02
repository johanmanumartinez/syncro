"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Meeting } from "@/lib/types";

const STATUS: Record<Meeting["status"], { label: string; tone: string }> = {
  queued: { label: "En cola", tone: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  joining: { label: "Entrando…", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  waiting_admit: { label: "Esperando que lo admitan", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  recording: { label: "Grabando", tone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  processing: { label: "Procesando", tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" },
  done: { label: "Listo", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  failed: { label: "Falló", tone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  cancelled: { label: "Cancelada", tone: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

const ACTIVE: Meeting["status"][] = ["queued", "joining", "waiting_admit", "recording", "processing"];
const CANCELLABLE: Meeting["status"][] = ["queued", "joining", "waiting_admit", "recording"];

export default function MeetingsClient({ meetings }: { meetings: Meeting[] }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasActive = meetings.some((m) => ACTIVE.includes(m.status));
  useEffect(() => {
    if (!hasActive) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [hasActive, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/meetings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, title, consent }),
    });
    setBusy(false);
    if (!res.ok) {
      const { error: msg } = (await res.json().catch(() => ({}))) as { error?: string };
      setError(msg ?? "No se pudo crear la reunión");
      return;
    }
    setUrl("");
    setTitle("");
    setConsent(false);
    router.refresh();
  }

  async function cancel(id: string) {
    await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="card space-y-4 p-5">
        <h2 className="text-sm font-semibold">Grabar una reunión</h2>
        <p className="text-sm text-zinc-500">
          Pega el enlace de Google Meet o Zoom. El bot entrará como participante, escribirá un aviso de grabación en
          el chat y grabará audio y video cuando lo admitan.
        </p>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          type="url"
          placeholder="https://meet.google.com/abc-defg-hij"
          className="input"
        />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional)" className="input" />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
          <span>
            Confirmo que tengo derecho a grabar esta reunión y que los participantes serán informados (el bot
            anuncia la grabación en el chat y se identifica en su nombre).
          </span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy || !consent} className="btn-primary">{busy ? "Enviando…" : "Enviar el bot"}</button>
      </form>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Reuniones</h2>
        {meetings.length === 0 ? (
          <div className="card p-8 text-center text-sm text-zinc-500">Aún no has grabado ninguna reunión.</div>
        ) : (
          <ul className="space-y-3">
            {meetings.map((m) => (
              <li key={m.id} className="card flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.title || m.url}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {m.platform === "meet" ? "Google Meet" : "Zoom"} · {new Date(m.created_at).toLocaleString("es")}
                  </p>
                  {m.error && <p className="mt-1 text-xs text-red-600">{m.error}</p>}
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS[m.status].tone}`}>
                  {STATUS[m.status].label}
                </span>
                {m.video_id && (
                  <Link href={`/v/${m.video_id}`} className="btn-ghost">Ver video</Link>
                )}
                {CANCELLABLE.includes(m.status) && (
                  <button onClick={() => cancel(m.id)} className="btn-danger">
                    {m.status === "recording" ? "Detener" : "Cancelar"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
