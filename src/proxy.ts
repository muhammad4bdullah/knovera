import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  const config = getSupabasePublicConfig();
  const path = request.nextUrl.pathname;
  const isProtected = path === "/app" || path.startsWith("/app/");
  const loginPage = path === "/login" || path === "/signup";

  if (!config) {
    if (isProtected) {
      const destination = new URL("/login", request.url);
      destination.searchParams.set("setup", "supabase");
      return NextResponse.redirect(destination);
    }
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Unable to refresh the authentication session.", error.message);
  }

  if (isProtected && !data.user) {
    const destination = new URL("/login", request.url);
    destination.searchParams.set("next", path);
    return NextResponse.redirect(destination);
  }

  if (loginPage && data.user) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/app/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/auth/:path*",
  ],
};
