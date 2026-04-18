import { NextRequest, NextResponse } from "next/server";

import { getMacInstallerDownloadUrl } from "../../../lib/github-release";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = await getMacInstallerDownloadUrl();
  if (!url) {
    const fallback = new URL("/", request.url);
    fallback.hash = "download";
    return NextResponse.redirect(fallback, 302);
  }
  return NextResponse.redirect(url, 302);
}
