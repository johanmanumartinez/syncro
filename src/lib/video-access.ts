import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, type Video } from "@/lib/types";

export type ViewerResult =
  | { state: "ok"; video: Video; signedUrl: string; isOwner: boolean; userId: string | null }
  | { state: "login_required" }
  | { state: "forbidden" }
  | { state: "not_found" };

/**
 * Comprueba el acceso con la RLS del usuario (público / restringido / dueño)
 * y, si pasa, firma una URL temporal del archivo (el bucket es privado).
 */
export async function getVideoForViewer(id: string): Promise<ViewerResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { state: "not_found" };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  const { data: video } = await supabase.from("videos").select("*").eq("id", id).maybeSingle();

  if (!video) {
    // La RLS oculta los videos sin acceso: distinguimos "no existe" de "restringido".
    const admin = createAdminClient();
    const { data: exists } = await admin.from("videos").select("visibility").eq("id", id).maybeSingle();
    if (!exists) return { state: "not_found" };
    return user ? { state: "forbidden" } : { state: "login_required" };
  }

  if (video.status !== "ready") {
    const isOwner = user?.id === video.owner_id;
    return isOwner ? { state: "ok", video, signedUrl: "", isOwner, userId: user?.id ?? null } : { state: "not_found" };
  }

  const admin = createAdminClient();
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(video.storage_path, 60 * 60 * 3);

  return {
    state: "ok",
    video: video as Video,
    signedUrl: signed?.signedUrl ?? "",
    isOwner: user?.id === video.owner_id,
    userId: user?.id ?? null,
  };
}
