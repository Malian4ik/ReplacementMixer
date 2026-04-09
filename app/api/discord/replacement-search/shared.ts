import { requireJudgeSession } from "@/lib/route-auth";

export async function ensureJudgeAccess() {
  const auth = await requireJudgeSession();
  if (!auth.ok) {
    return auth.response;
  }

  return null;
}
