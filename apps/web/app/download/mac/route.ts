import { NextRequest, NextResponse } from "next/server";

import { getMacInstallerDownloadUrl } from "../../../lib/github-release";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = await getMacInstallerDownloadUrl();
  if (!url) {
    return NextResponse.redirect(new URL("/", request.url), 302);
  }
  return NextResponse.redirect(url, 302);
}
