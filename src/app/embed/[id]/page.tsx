import { getVideoForViewer } from "@/lib/video-access";

// Vista mínima para incrustar con <iframe>. Respeta los mismos permisos que /v/[id].
export default async function EmbedPage({ params }: PageProps<"/embed/[id]">) {
  const { id } = await params;
  const result = await getVideoForViewer(id);

  const box = "flex h-screen w-full items-center justify-center bg-black p-4 text-center text-sm text-zinc-300";

  if (result.state === "not_found") return <div className={box}>Video no encontrado</div>;
  if (result.state !== "ok" || !result.signedUrl) {
    return (
      <div className={box}>
        <div>
          Este video no es público.
          <br />
          <a href={`/v/${id}`} target="_blank" rel="noreferrer" className="text-indigo-400 underline">
            Abrir en Syncro
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full bg-black">
      <video src={result.signedUrl} controls playsInline className="h-full w-full" />
    </div>
  );
}
