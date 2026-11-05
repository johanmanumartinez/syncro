import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET } from "@/lib/types";
import { getUserFromRequest, CORS_HEADERS } from "@/lib/supabase/token-auth";

// Preflight CORS para la extensión de Chrome
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Crea el registro del video y devuelve una URL de subida firmada
// (el navegador sube el archivo directo a Storage).
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401, headers: CORS_HEADERS });
  const auth = { user };

  const body = (await req.json()) as { title?: string; source?: string; mimeType?: string };
  const source = ["screen", "camera", "upload"].includes(body.source ?? "") ? body.source! : "screen";
  const mimeType = body.mimeType?.startsWith("video/") ? body.mimeType.split(";")[0] : "video/webm";
  const ext = mimeType === "video/mp4" ? "mp4" : "webm";

  const id = crypto.randomUUID();
  const path = `${auth.user.id}/${id}.${ext}`;

  const admin = createAdminClient();

  const { error } = await admin.from("videos").insert({
    id,
    owner_id: auth.user.id,
    title: body.title?.trim() || "Video sin título",
    source,
    status: "uploading",
    storage_path: path,
    mime_type: mimeType,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400, headers: CORS_HEADERS });

  const { data: upload, error: upErr } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (upErr || !upload) return NextResponse.json({ error: upErr?.message ?? "No se pudo crear la subida" }, { status: 500, headers: CORS_HEADERS });

  return NextResponse.json({ id, path, token: upload.token }, { headers: CORS_HEADERS });
}
