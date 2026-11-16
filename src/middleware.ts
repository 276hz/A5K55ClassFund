import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list: { name: string; value: string; options: CookieOptions }[]) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const url = request.nextUrl.clone(); url.pathname = "/login"; url.search = "";
    return NextResponse.redirect(url);
  }
  const { data: profile, error: profileError } = await supabase.from("profiles").select("must_change_password").eq("id", user.id).maybeSingle();
  if (profileError || !profile) {
    const url = request.nextUrl.clone(); url.pathname = "/login"; url.search = "?error=setup";
    return NextResponse.redirect(url);
  }
  if (profile.must_change_password && request.nextUrl.pathname !== "/dat-lai-mat-khau") {
    const url = request.nextUrl.clone(); url.pathname = "/dat-lai-mat-khau"; url.search = "";
    return NextResponse.redirect(url);
  }
  if (!profile.must_change_password && request.nextUrl.pathname === "/dat-lai-mat-khau") {
    const url = request.nextUrl.clone(); url.pathname = "/tong-quan"; url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/tong-quan/:path*", "/hoc-sinh/:path*", "/cac-khoan-thu/:path*", "/ghi-nhan/:path*", "/giao-dich/:path*",
    "/bao-cao/:path*", "/nhat-ky/:path*", "/cai-dat/:path*", "/khac/:path*", "/dat-lai-mat-khau/:path*"],
};
