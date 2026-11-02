"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDuration } from "@/lib/format";

type Mode = "screen_cam" | "screen" | "camera";
type Phase = "idle" | "countdown" | "recording" | "paused" | "review" | "uploading";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "screen_cam", label: "Pantalla + cámara", hint: "Tu cámara en un círculo sobre la pantalla" },
  { id: "screen", label: "Solo pantalla", hint: "Pantalla, ventana o pestaña" },
  { id: "camera", label: "Solo cámara", hint: "Mensaje de video" },
];

function pickMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export default function Recorder() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("screen_cam");
  const [micOn, setMicOn] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const clockRef = useRef({ startedAt: 0, pausedMs: 0, pausedAt: 0 });
  const durationRef = useRef(0);

  const stopAll = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  // El <video> en vivo solo existe mientras se graba: se conecta el stream al montarse.
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    if (liveRef.current && (phase === "countdown" || phase === "recording" || phase === "paused")) {
      liveRef.current.srcObject = streamRef.current;
    }
  }, [phase]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // Cronómetro (descuenta las pausas).
  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => {
      const c = clockRef.current;
      setElapsed((Date.now() - c.startedAt - c.pausedMs) / 1000);
    }, 250);
    return () => clearInterval(id);
  }, [phase]);

  async function buildStream(): Promise<MediaStream> {
    const toStop: MediaStream[] = [];
    const extra: (() => void)[] = [];
    let videoTrack: MediaStreamTrack;
    const audioSources: MediaStream[] = [];

    let screen: MediaStream | null = null;
    let cam: MediaStream | null = null;

    if (mode !== "camera") {
      screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      toStop.push(screen);
      if (screen.getAudioTracks().length) audioSources.push(new MediaStream(screen.getAudioTracks()));
    }
    if (mode !== "screen") {
      cam = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      toStop.push(cam);
    }
    if (micOn) {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      toStop.push(mic);
      audioSources.push(mic);
    }

    if (mode === "screen") {
      videoTrack = screen!.getVideoTracks()[0];
    } else if (mode === "camera") {
      videoTrack = cam!.getVideoTracks()[0];
    } else {
      // Pantalla + cámara: se compone en un canvas (cámara en círculo, abajo a la izquierda).
      const screenVideo = document.createElement("video");
      const camVideo = document.createElement("video");
      screenVideo.srcObject = screen;
      camVideo.srcObject = cam;
      screenVideo.muted = camVideo.muted = true;
      await Promise.all([screenVideo.play(), camVideo.play()]);

      const settings = screen!.getVideoTracks()[0].getSettings();
      const canvas = document.createElement("canvas");
      canvas.width = settings.width ?? 1280;
      canvas.height = settings.height ?? 720;
      const ctx = canvas.getContext("2d")!;

      const draw = () => {
        ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
        const d = Math.round(canvas.height * 0.28);
        const x = Math.round(canvas.height * 0.03);
        const y = canvas.height - d - x;
        const side = Math.min(camVideo.videoWidth, camVideo.videoHeight) || 1;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
          camVideo,
          (camVideo.videoWidth - side) / 2, (camVideo.videoHeight - side) / 2, side, side,
          x, y, d, d,
        );
        ctx.restore();
      };

      // Un Worker marca el ritmo: los timers de la página se frenan cuando la pestaña queda en segundo plano.
      const worker = new Worker(
        URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),33)"], { type: "text/javascript" })),
      );
      worker.onmessage = draw;
      extra.push(() => worker.terminate());

      videoTrack = canvas.captureStream(30).getVideoTracks()[0];
    }

    const tracks: MediaStreamTrack[] = [videoTrack];
    if (audioSources.length) {
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      audioSources.forEach((s) => audioCtx.createMediaStreamSource(s).connect(dest));
      tracks.push(dest.stream.getAudioTracks()[0]);
      extra.push(() => void audioCtx.close());
    }

    cleanupRef.current = () => {
      extra.forEach((fn) => fn());
      toStop.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      recorderRef.current = null;
    };

    // Si el usuario deja de compartir desde el navegador, se detiene la grabación.
    screen?.getVideoTracks()[0].addEventListener("ended", () => stop());

    return new MediaStream(tracks);
  }

  async function start() {
    setError(null);
    if (typeof MediaRecorder === "undefined") {
      setError("Este navegador no admite grabación. Usa Chrome, Edge o Firefox.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await buildStream();
    } catch (e) {
      stopAll();
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Permiso denegado. Permite el acceso a pantalla, cámara o micrófono."
          : "No se pudo iniciar la captura.",
      );
      return;
    }

    streamRef.current = stream;
    setPhase("countdown");
    for (let i = 3; i > 0; i--) {
      setCount(i);
      await new Promise((r) => setTimeout(r, 1000));
    }

    chunksRef.current = [];
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 3_000_000 } : undefined);
    rec.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || mimeType || "video/webm";
      const out = new Blob(chunksRef.current, { type });
      const c = clockRef.current;
      durationRef.current = (Date.now() - c.startedAt - c.pausedMs) / 1000;
      stopAll();
      setBlob(out);
      setPreviewUrl(URL.createObjectURL(out));
      setPhase("review");
    };
    recorderRef.current = rec;
    clockRef.current = { startedAt: Date.now(), pausedMs: 0, pausedAt: 0 };
    setElapsed(0);
    rec.start(1000);
    setPhase("recording");
  }

  function stop() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      if (rec.state === "paused") clockRef.current.pausedMs += Date.now() - clockRef.current.pausedAt;
      rec.stop();
    }
  }

  function togglePause() {
    const rec = recorderRef.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      clockRef.current.pausedAt = Date.now();
      setPhase("paused");
    } else if (rec.state === "paused") {
      clockRef.current.pausedMs += Date.now() - clockRef.current.pausedAt;
      rec.resume();
      setPhase("recording");
    }
  }

  function discard() {
    setBlob(null);
    setPreviewUrl(null);
    setElapsed(0);
    setPhase("idle");
  }

  async function save() {
    if (!blob) return;
    setPhase("uploading");
    setError(null);
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title || `Grabación ${new Date().toLocaleString("es")}`,
          source: mode === "camera" ? "camera" : "screen",
          mimeType: blob.type,
        }),
      });
      const created = (await res.json()) as { id?: string; path?: string; token?: string; error?: string };
      if (!res.ok || !created.id) throw new Error(created.error ?? "No se pudo crear el video");

      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from("videos")
        .uploadToSignedUrl(created.path!, created.token!, blob, { contentType: blob.type.split(";")[0] });
      if (upErr) throw new Error(upErr.message);

      await fetch(`/api/videos/${created.id}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ durationSeconds: durationRef.current }),
      });
      router.push(`/v/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir el video");
      setPhase("review");
    }
  }

  if (phase === "review" || phase === "uploading") {
    return (
      <div className="space-y-4">
        <video src={previewUrl ?? undefined} controls className="aspect-video w-full rounded-xl bg-black" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título del video"
          className="input"
          disabled={phase === "uploading"}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button onClick={save} disabled={phase === "uploading"} className="btn-primary">
            {phase === "uploading" ? "Subiendo…" : "Guardar y compartir"}
          </button>
          <button onClick={discard} disabled={phase === "uploading"} className="btn-ghost">Descartar</button>
        </div>
      </div>
    );
  }

  const active = phase === "countdown" || phase === "recording" || phase === "paused";

  return (
    <div className="space-y-5">
      {!active && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`card p-4 text-left transition ${mode === m.id ? "ring-2 ring-indigo-500" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
              >
                <div className="font-medium">{m.label}</div>
                <div className="mt-1 text-xs text-zinc-500">{m.hint}</div>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={micOn} onChange={(e) => setMicOn(e.target.checked)} />
            Grabar micrófono
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button onClick={start} className="btn-primary">Empezar a grabar</button>
        </>
      )}

      {active && (
        <div className="space-y-4">
          <div className="relative">
            <video ref={liveRef} autoPlay muted playsInline className="aspect-video w-full rounded-xl bg-black" />
            {phase === "countdown" && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 text-7xl font-bold text-white">
                {count}
              </div>
            )}
          </div>
          {phase !== "countdown" && (
            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${phase === "recording" ? "animate-pulse bg-red-600" : "bg-zinc-400"}`} />
              <span className="font-mono text-lg">{formatDuration(elapsed)}</span>
              <button onClick={togglePause} className="btn-ghost">{phase === "paused" ? "Reanudar" : "Pausar"}</button>
              <button onClick={stop} className="btn-primary">Terminar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
