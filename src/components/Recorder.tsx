"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDuration } from "@/lib/format";

type Source = "screen_cam" | "screen" | "camera";
type Layout = "pip" | "split_h" | "split_v";
type CamShape = "circle" | "square" | "rect";
type SplitOrder = "cam_screen" | "screen_cam";
type Phase = "idle" | "countdown" | "recording" | "paused" | "review" | "uploading";

const SOURCES: { id: Source; label: string; hint: string }[] = [
  { id: "screen_cam", label: "Pantalla + cámara", hint: "Elige el diseño abajo" },
  { id: "screen",     label: "Solo pantalla",     hint: "Pantalla, ventana o pestaña" },
  { id: "camera",     label: "Solo cámara",        hint: "Mensaje de video" },
];

const LAYOUTS: { id: Layout; label: string }[] = [
  { id: "pip",     label: "Superposición" },
  { id: "split_h", label: "Lado a lado" },
  { id: "split_v", label: "Arriba / abajo" },
];

const CAM_SHAPES: { id: CamShape; label: string }[] = [
  { id: "circle", label: "Círculo" },
  { id: "square", label: "Cuadrado" },
  { id: "rect",   label: "Rectángulo" },
];

function pickMimeType() {
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

// Dibuja un video centrado y recortado para llenar el área destino.
function drawFit(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number, y: number, w: number, h: number,
) {
  if (!video.videoWidth || !video.videoHeight) return;
  const vr = video.videoWidth / video.videoHeight;
  const br = w / h;
  let sx: number, sy: number, sw: number, sh: number;
  if (vr > br) {
    sh = video.videoHeight; sw = sh * br;
    sx = (video.videoWidth - sw) / 2; sy = 0;
  } else {
    sw = video.videoWidth; sh = sw / br;
    sx = 0; sy = (video.videoHeight - sh) / 2;
  }
  ctx.drawImage(video, sx, sy, sw, sh, x, y, w, h);
}

export default function Recorder() {
  const router = useRouter();
  const [source, setSource]       = useState<Source>("screen_cam");
  const [layout, setLayout]       = useState<Layout>("pip");
  const [camShape, setCamShape]   = useState<CamShape>("circle");
  const [splitOrder, setSplitOrder] = useState<SplitOrder>("cam_screen");
  const [micOn, setMicOn]         = useState(true);
  const [phase, setPhase]         = useState<Phase>("idle");
  const [count, setCount]         = useState(3);
  const [elapsed, setElapsed]     = useState(0);
  const [error, setError]         = useState<string | null>(null);
  const [blob, setBlob]           = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle]         = useState("");

  const recorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const cleanupRef   = useRef<(() => void) | null>(null);
  const liveRef      = useRef<HTMLVideoElement>(null);
  const clockRef     = useRef({ startedAt: 0, pausedMs: 0, pausedAt: 0 });
  const durationRef  = useRef(0);
  const streamRef    = useRef<MediaStream | null>(null);

  const stopAll = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  useEffect(() => {
    if (liveRef.current && (phase === "recording" || phase === "paused")) {
      liveRef.current.srcObject = streamRef.current;
    }
  }, [phase]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

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
    const audioSources: MediaStream[] = [];

    let screen: MediaStream | null = null;
    let cam: MediaStream | null = null;

    if (source !== "camera") {
      screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      toStop.push(screen);
      if (screen.getAudioTracks().length) audioSources.push(new MediaStream(screen.getAudioTracks()));
    }
    if (source !== "screen") {
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

    let videoTrack: MediaStreamTrack;

    if (source === "screen") {
      videoTrack = screen!.getVideoTracks()[0];
    } else if (source === "camera") {
      videoTrack = cam!.getVideoTracks()[0];
    } else {
      // Pantalla + cámara: composición en canvas.
      const screenVideo = document.createElement("video");
      const camVideo    = document.createElement("video");
      screenVideo.srcObject = screen;
      camVideo.srcObject    = cam;
      screenVideo.muted = camVideo.muted = true;
      await Promise.all([screenVideo.play(), camVideo.play()]);

      const settings = screen!.getVideoTracks()[0].getSettings();
      const canvas   = document.createElement("canvas");
      canvas.width   = settings.width  ?? 1280;
      canvas.height  = settings.height ?? 720;
      const ctx = canvas.getContext("2d")!;

      const draw = () => {
        if (layout === "split_h") {
          const halfW = canvas.width / 2;
          const [leftVid, rightVid] = splitOrder === "cam_screen"
            ? [camVideo, screenVideo]
            : [screenVideo, camVideo];
          drawFit(ctx, leftVid,  0,     0, halfW, canvas.height);
          drawFit(ctx, rightVid, halfW, 0, halfW, canvas.height);
          ctx.fillStyle = "#111111";
          ctx.fillRect(halfW - 2, 0, 4, canvas.height);

        } else if (layout === "split_v") {
          const halfH = canvas.height / 2;
          const [topVid, bottomVid] = splitOrder === "cam_screen"
            ? [camVideo, screenVideo]
            : [screenVideo, camVideo];
          drawFit(ctx, topVid,    0, 0,     canvas.width, halfH);
          drawFit(ctx, bottomVid, 0, halfH, canvas.width, halfH);
          ctx.fillStyle = "#111111";
          ctx.fillRect(0, halfH - 2, canvas.width, 4);

        } else {
          // PiP
          ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);

          const pip_h = Math.round(canvas.height * 0.28);
          const pip_w = camShape === "rect" ? Math.round(pip_h * 16 / 9) : pip_h;
          const pad   = Math.round(canvas.height * 0.03);
          const pip_x = pad;
          const pip_y = canvas.height - pip_h - pad;

          ctx.save();
          ctx.beginPath();
          if (camShape === "circle") {
            ctx.arc(pip_x + pip_w / 2, pip_y + pip_h / 2, pip_w / 2, 0, Math.PI * 2);
          } else {
            const r = Math.round(pip_h * 0.08);
            ctx.roundRect(pip_x, pip_y, pip_w, pip_h, r);
          }
          ctx.clip();

          if (camShape === "rect") {
            drawFit(ctx, camVideo, pip_x, pip_y, pip_w, pip_h);
          } else {
            const side = Math.min(camVideo.videoWidth, camVideo.videoHeight) || 1;
            const sx   = (camVideo.videoWidth  - side) / 2;
            const sy   = (camVideo.videoHeight - side) / 2;
            ctx.drawImage(camVideo, sx, sy, side, side, pip_x, pip_y, pip_w, pip_h);
          }
          ctx.restore();
        }
      };

      const worker = new Worker(
        URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),33)"], { type: "text/javascript" })),
      );
      worker.onmessage = draw;
      extra.push(() => worker.terminate());

      videoTrack = canvas.captureStream(30).getVideoTracks()[0];
    }

    const tracks: MediaStreamTrack[] = [videoTrack!];
    if (audioSources.length) {
      const audioCtx = new AudioContext();
      const dest     = audioCtx.createMediaStreamDestination();
      audioSources.forEach((s) => audioCtx.createMediaStreamSource(s).connect(dest));
      tracks.push(dest.stream.getAudioTracks()[0]);
      extra.push(() => void audioCtx.close());
    }

    cleanupRef.current = () => {
      extra.forEach((fn) => fn());
      toStop.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      recorderRef.current = null;
    };

    screen?.getVideoTracks()[0].addEventListener("ended", () => stop());
    return new MediaStream(tracks);
  }

  async function start() {
    setError(null);
    if (typeof MediaRecorder === "undefined") {
      setError("Este navegador no admite grabación. Usa Chrome, Edge o Firefox.");
      return;
    }

    // Countdown ANTES de pedir permisos para que no quede grabado.
    setPhase("countdown");
    for (let i = 3; i > 0; i--) {
      setCount(i);
      await new Promise((r) => setTimeout(r, 1000));
    }

    let stream: MediaStream;
    try {
      stream = await buildStream();
    } catch (e) {
      stopAll();
      setPhase("idle");
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Permiso denegado. Permite el acceso a pantalla, cámara o micrófono."
          : "No se pudo iniciar la captura.",
      );
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 3_000_000 } : undefined);
    rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
    rec.onstop = () => {
      const type = rec.mimeType || mimeType || "video/webm";
      const out  = new Blob(chunksRef.current, { type });
      const c    = clockRef.current;
      durationRef.current = (Date.now() - c.startedAt - c.pausedMs) / 1000;
      stopAll();
      setBlob(out);
      setPreviewUrl(URL.createObjectURL(out));
      setPhase("review");
    };
    recorderRef.current = rec;
    clockRef.current    = { startedAt: Date.now(), pausedMs: 0, pausedAt: 0 };
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
    setBlob(null); setPreviewUrl(null); setElapsed(0); setPhase("idle");
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
          source: source === "camera" ? "camera" : "screen",
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

  // ── Review / uploading ──────────────────────────────────────────────────────
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

  // ── Idle + Countdown + Recording ───────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Configuración (solo cuando no está activo) */}
      {!active && (
        <>
          {/* Fuente */}
          <div className="grid gap-3 sm:grid-cols-3">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                onClick={() => setSource(s.id)}
                className={`card p-4 text-left transition ${source === s.id ? "ring-2 ring-indigo-500" : "hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
              >
                <div className="font-medium">{s.label}</div>
                <div className="mt-1 text-xs text-zinc-500">{s.hint}</div>
              </button>
            ))}
          </div>

          {/* Opciones de composición (solo screen_cam) */}
          {source === "screen_cam" && (
            <div className="card p-4 space-y-4">
              {/* Layout */}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Diseño</p>
                <div className="flex flex-wrap gap-2">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setLayout(l.id)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition ${layout === l.id ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"}`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Forma de la cámara (solo PiP) */}
              {layout === "pip" && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Forma de la cámara</p>
                  <div className="flex flex-wrap gap-2">
                    {CAM_SHAPES.map((sh) => (
                      <button
                        key={sh.id}
                        onClick={() => setCamShape(sh.id)}
                        className={`rounded-lg border px-3 py-1.5 text-sm transition ${camShape === sh.id ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"}`}
                      >
                        {sh.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Orden (split) */}
              {(layout === "split_h" || layout === "split_v") && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {layout === "split_h" ? "Posición cámara" : "Posición cámara"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSplitOrder("cam_screen")}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition ${splitOrder === "cam_screen" ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"}`}
                    >
                      {layout === "split_h" ? "Cámara izquierda" : "Cámara arriba"}
                    </button>
                    <button
                      onClick={() => setSplitOrder("screen_cam")}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition ${splitOrder === "screen_cam" ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"}`}
                    >
                      {layout === "split_h" ? "Cámara derecha" : "Cámara abajo"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Micrófono */}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={micOn} onChange={(e) => setMicOn(e.target.checked)} />
            Grabar micrófono
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button onClick={start} className="btn-primary">Empezar a grabar</button>
        </>
      )}

      {/* Countdown */}
      {phase === "countdown" && (
        <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-black text-7xl font-bold text-white">
          {count}
        </div>
      )}

      {/* Recording / paused */}
      {(phase === "recording" || phase === "paused") && (
        <div className="space-y-4">
          <video ref={liveRef} autoPlay muted playsInline className="aspect-video w-full rounded-xl bg-black" />
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${phase === "recording" ? "animate-pulse bg-red-600" : "bg-zinc-400"}`} />
            <span className="font-mono text-lg">{formatDuration(elapsed)}</span>
            <button onClick={togglePause} className="btn-ghost">{phase === "paused" ? "Reanudar" : "Pausar"}</button>
            <button onClick={stop} className="btn-primary">Terminar</button>
          </div>
        </div>
      )}

    </div>
  );
}
