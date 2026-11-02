import { requireUser } from "@/lib/auth";
import Recorder from "@/components/Recorder";

export default async function RecordPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold">Nueva grabación</h1>
      <Recorder />
    </div>
  );
}
