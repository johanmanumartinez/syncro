export function formatDuration(totalSeconds: number | null | undefined) {
  if (!totalSeconds && totalSeconds !== 0) return "";
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function formatMs(ms: number) {
  return formatDuration(ms / 1000);
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

export const VISIBILITY_LABEL = {
  private: "Privado",
  public: "Cualquiera con el enlace",
  restricted: "Restringido",
} as const;
