import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function detectPlatform(url: URL): "meet" | "zoom" | "other" {
  const host = url.hostname.toLowerCase();
  if (host === "meet.google.com") return "meet";
  if (host === "zoom.us" || host.endsWith(".zoom.us") || host.endsWith(".zoom.com")) return "zoom";
  return "other";
}

// Encola una reunión: el servicio bot la recoge, entra con aviso de grabación y graba.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = (await req.json()) as { url?: string; title?: string; consent?: boolean };

  if (!body.consent) {
    return NextResponse.json(
      { error: "Confirma que los participantes serán avisados de la grabación." },
      { status: 400 },
    );
  }

  let url: URL;
  try {
    url = new URL(body.url ?? "");
    if (url.protocol !== "https:") throw new Error();
  } catch {
    return NextResponse.json({ error: "Enlace de reunión no válido (debe ser https)." }, { status: 400 });
  }

  const platform = detectPlatform(url);
  if (platform === "other") {
    return NextResponse.json({ error: "Por ahora solo se admiten enlaces de Google Meet y Zoom." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("meetings")
    .insert({
      owner_id: auth.user.id,
      url: url.toString(),
      platform,
      title: body.title?.trim() || null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ meeting: data });
}
