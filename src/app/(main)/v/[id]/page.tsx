import Link from "next/link";
import { notFound } from "next/navigation";
import { getVideoForViewer } from "@/lib/video-access";
import { createClient } from "@/lib/supabase/server";
import { formatDate, VISIBILITY_LABEL } from "@/lib/format";
import VideoPlayer from "@/components/VideoPlayer";
import SharePanel from "@/components/SharePanel";

export default async function VideoPage({ params }: PageProps<"/v/[id]">) {
  const { id } = await params;
  const result = await getVideoForViewer(id);

  if (result.state === "not_found") notFound();

  if (result.state === "login_required") {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Este video es privado</h1>
        <p className="mt-2 text-sm text-zinc-500">Inicia sesión para comprobar si tienes acceso.</p>
        <Link href="/login" className="btn-primary mt-5">Iniciar sesión</Link>
      </div>
    );
  }

  if (result.state === "forbidden") {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">No tienes acceso a este video</h1>
        <p className="mt-2 text-sm text-zinc-500">Pide al propietario que te lo comparta con tu correo.</p>
      </div>
    );
  }

  const { video, signedUrl, isOwner } = result;

  let emails: string[] = [];
  if (isOwner) {
    const supabase = await createClient();
    const { data } = await supabase.from("video_shares").select("email").eq("video_id", id).order("email");
    emails = (data ?? []).map((r) => r.email);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{video.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {formatDate(video.created_at)} · {VISIBILITY_LABEL[video.visibility]}
        </p>
      </div>

      {video.status !== "ready" || !signedUrl ? (
        <div className="card p-10 text-center text-zinc-500">
          {video.status === "uploading" ? "El video aún se está subiendo…" : "El video no está disponible."}
        </div>
      ) : (
        <VideoPlayer videoId={video.id} src={signedUrl} title={video.title} isOwner={isOwner} />
      )}

      {isOwner && (
        <SharePanel
          videoId={video.id}
          initialTitle={video.title}
          initialVisibility={video.visibility}
          initialEmails={emails}
        />
      )}
    </div>
  );
}
