import { NextResponse } from "next/server";
import { getDashboardSnapshot } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { snapshot, source } = await getDashboardSnapshot();

  return NextResponse.json(
    {
      ...snapshot,
      source,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
