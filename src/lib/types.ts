export type Visibility = "private" | "public" | "restricted";

export type Video = {
  id: string;
  owner_id: string;
  title: string;
  source: "screen" | "camera" | "upload" | "meeting";
  status: "uploading" | "ready" | "failed";
  storage_path: string;
  mime_type: string;
  duration_seconds: number | null;
  visibility: Visibility;
  meeting_id: string | null;
  created_at: string;
};

export type Utterance = { speaker: string; start: number; end: number; text: string };

export type Transcript = {
  video_id: string;
  status: "pending" | "processing" | "done" | "error";
  provider_id: string | null;
  language: string | null;
  utterances: Utterance[];
  speakers: Record<string, string>;
  error: string | null;
};

export type Meeting = {
  id: string;
  owner_id: string;
  url: string;
  platform: "meet" | "zoom" | "other";
  title: string | null;
  bot_name: string;
  status:
    | "queued"
    | "joining"
    | "waiting_admit"
    | "recording"
    | "processing"
    | "done"
    | "failed"
    | "cancelled";
  error: string | null;
  video_id: string | null;
  created_at: string;
};

export const BUCKET = "videos";
