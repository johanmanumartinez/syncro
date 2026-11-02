import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, type Video } from "@/lib/types";
import { formatDate, formatDuration, VISIBILITY_LABEL } from "@/lib/format";

const SOURCE_LABEL = { screen: "Pantalla", camera: "Cámara", upload: "Subido", meeting: "Reunión" } as const;

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const user = await requireUser();
  const { q: rawQ, source: rawSource } = await searchParams;
  const q = typeof rawQ === "string" ? rawQ.trim() : "";
  const source = typeof rawSource === "string" ? rawSource : "";

  const supabase = await createClient();
  let query = supabase
    .from("videos")
    .select("*")
    .eq("owner_id", user.id)
    .neq("status", "uploading")
    .order("created_at", { ascending: false });
  if (q) query = query.ilike("title", `%${q.replace(/[%_]/g, "")}%`);
  if (source in SOURCE_LABEL) query = query.eq("source", source);
  const { data } = await query;
  const videos = (data ?? []) as Video[];

  // URLs firmadas para mostrar el primer fotograma como miniatura.
  const previews = new Map<string, string>();
  if (videos.length > 0) {
    const { data: signed } = await createAdminClient()
      .storage.from(BUCKET)
      .createSignedUrls(videos.map((v) => v.storage_path), 60 * 60);
    signed?.forEach((s, i) => {
      if (s.signedUrl) previews.set(videos[i].id, s.signedUrl);
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Galería</h1>
        <form className="flex gap-2" action="/library">
          <input name="q" defaultValue={q} placeholder="Buscar por título…" className="input w-56" />
          <select name="source" defaultValue={source} className="input w-36">
            <option value="">Todos</option>
            {Object.entries(SOURCE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className="btn-ghost">Filtrar</button>
        </form>
        <Link href="/record" className="btn-primary">Nueva grabación</Link>
      </div>

      {videos.length === 0 ? (
        <div className="card p-10 text-center text-zinc-500">
          {q || source ? "No hay videos con ese filtro." : "Aún no tienes videos. Graba el primero o añade una reunión."}
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <li key={v.id}>
              <Link href={`/v/${v.id}`} className="card block overflow-hidden transition hover:shadow-md">
                <div className="relative aspect-video bg-zinc-900">
                  {previews.get(v.id) && (
                    <video
                      src={`${previews.get(v.id)}#t=0.5`}
                      preload="metadata"
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  )}
                  {v.duration_seconds != null && (
                    <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                      {formatDuration(v.duration_seconds)}
                    </span>
                  )}
                  <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                    {SOURCE_LABEL[v.source]}
                  </span>
                </div>
                <div className="p-3">
                  <h2 className="truncate text-sm font-medium">{v.title}</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDate(v.created_at)} · {VISIBILITY_LABEL[v.visibility]}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
