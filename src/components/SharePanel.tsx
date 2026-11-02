"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Visibility } from "@/lib/types";

type Props = {
  videoId: string;
  initialTitle: string;
  initialVisibility: Visibility;
  initialEmails: string[];
};

export default function SharePanel({ videoId, initialTitle, initialVisibility, initialEmails }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  const [emails, setEmails] = useState(initialEmails.join("\n"));
  const [width, setWidth] = useState(640);
  const [height, setHeight] = useState(360);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const origin = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
  const link = `${origin}/v/${videoId}`;
  const embed = `<iframe src="${origin}/embed/${videoId}" width="${width}" height="${height}" frameborder="0" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>`;

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`${what} copiado`);
    } catch {
      setMsg("No se pudo copiar; selecciona el texto manualmente.");
    }
    setTimeout(() => setMsg(null), 2500);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/videos/${videoId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        visibility,
        emails: emails.split(/[\s,;]+/).filter(Boolean),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg("Cambios guardados");
      router.refresh();
    } else {
      const { error } = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(error ?? "No se pudo guardar");
    }
  }

  async function remove() {
    if (!confirm("¿Eliminar este video definitivamente?")) return;
    const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
    if (res.ok) router.push("/library");
    else setMsg("No se pudo eliminar");
  }

  return (
    <section className="card space-y-5 p-5">
      <h2 className="text-sm font-semibold">Compartir</h2>

      <label className="block text-sm">
        Título
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="input mt-1" />
      </label>

      <label className="block text-sm">
        Quién puede verlo
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} className="input mt-1">
          <option value="private">Privado (solo yo)</option>
          <option value="restricted">Restringido (correos concretos)</option>
          <option value="public">Público (cualquiera con el enlace)</option>
        </select>
      </label>

      {visibility === "restricted" && (
        <label className="block text-sm">
          Correos con acceso (uno por línea)
          <textarea
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={4}
            placeholder="ana@empresa.com"
            className="input mt-1"
          />
          <span className="mt-1 block text-xs text-zinc-500">Deberán iniciar sesión en Syncro con ese correo.</span>
        </label>
      )}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? "Guardando…" : "Guardar"}</button>
        {msg && <span className="text-sm text-zinc-500">{msg}</span>}
      </div>

      <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <p className="text-sm font-medium">Enlace</p>
        <div className="flex gap-2">
          <input readOnly value={link} className="input font-mono text-xs" onFocus={(e) => e.target.select()} />
          <button onClick={() => copy(link, "Enlace")} className="btn-ghost">Copiar</button>
        </div>
        {visibility === "private" && (
          <p className="text-xs text-amber-600">El video es privado: el enlace solo funciona para ti.</p>
        )}
      </div>

      <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <p className="text-sm font-medium">Código embed</p>
        <div className="flex items-center gap-2 text-sm">
          <input type="number" min={200} value={width} onChange={(e) => setWidth(Number(e.target.value) || 640)} className="input w-24" />
          ×
          <input type="number" min={120} value={height} onChange={(e) => setHeight(Number(e.target.value) || 360)} className="input w-24" />
        </div>
        <textarea readOnly value={embed} rows={3} className="input font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button onClick={() => copy(embed, "Código embed")} className="btn-ghost">Copiar código</button>
        {visibility !== "public" && (
          <p className="text-xs text-amber-600">
            Para verlo incrustado en otras webs, el video debe ser público.
          </p>
        )}
      </div>

      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button onClick={remove} className="btn-danger">Eliminar video</button>
      </div>
    </section>
  );
}
