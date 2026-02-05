import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = req.nextUrl.pathname;

  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/signup");

  const isProtectedPage =
    pathname === "/" ||
    pathname.startsWith("/memos") ||
    pathname.startsWith("/onboarding");

  // 🚫 Not logged in → force login
  if (!user && isProtectedPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    const redirectRes = NextResponse.redirect(url);
    // Preserve any auth cookies that were set earlier on `res`
    res.cookies.getAll().forEach((c) => redirectRes.cookies.set(c));
    return redirectRes;
  }

  // ✅ Logged in but trying to access login/signup → redirect forward
  if (user && isAuthPage) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    const redirectRes = NextResponse.redirect(url);
    // Preserve any auth cookies that were set earlier on `res`
    res.cookies.getAll().forEach((c) => redirectRes.cookies.set(c));
    return redirectRes;
  }

  return res;
}

export const config = {
  matcher: ["/", "/memos/:path*", "/onboarding", "/login", "/signup"],
};