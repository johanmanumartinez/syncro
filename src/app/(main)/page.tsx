import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";

export default async function Home() {
  if (await getUser()) redirect("/library");

  return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Graba. Transcribe. Comparte.</h1>
      <p className="mt-4 text-zinc-500">
        Videos de pantalla y cámara, y reuniones de Google Meet o Zoom grabadas con transcripción por
        hablante, enlaces para compartir y código embed.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/login" className="btn-primary">Empezar</Link>
      </div>
    </div>
  );
}
