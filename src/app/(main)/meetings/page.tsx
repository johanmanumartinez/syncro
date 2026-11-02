import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import MeetingsClient from "@/components/MeetingsClient";
import type { Meeting } from "@/lib/types";

export default async function MeetingsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("meetings")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold">Reuniones</h1>
      <MeetingsClient meetings={(data ?? []) as Meeting[]} />
    </div>
  );
}
