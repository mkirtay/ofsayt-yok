import type { NextApiRequest, NextApiResponse } from "next";

import { buildApiUrl } from "@/pages/api/livescore/_shared";

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const url = buildApiUrl("matches/live.json", {});
    const response = await fetch(url);
    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json(data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
