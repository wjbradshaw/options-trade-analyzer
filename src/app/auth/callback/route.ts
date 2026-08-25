import { NextResponse, type NextRequest } from "next/server";
import { callbackOrigin, safeRedirectUrl } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requestedPath = request.nextUrl.searchParams.get("next");
  const origin = callbackOrigin(request.url, request.headers.get("host"));
  const nextUrl = safeRedirectUrl(requestedPath, origin);

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=Invalid%20sign-in%20link", origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, origin),
    );
  }

  return NextResponse.redirect(nextUrl);
}
