import NextAuth from "next-auth";

import {
    DEFAULT_LOGIN_REDIRECT,
    apiAuthPrefix,
    authRoutes,
    publicRoutes,
} from "@/routes";
import authConfig from "./auth.config";
import { NextResponse } from "next/dist/server/web/spec-extension/response";

const {auth} = NextAuth(authConfig);

export default auth((req)=>{
    const {nextUrl} = req;
    const isLoggedIn = !!req.auth

    const isApiAuthRoute = nextUrl.pathname.startsWith(apiAuthPrefix);
    const isPublicRoutes = publicRoutes.includes(nextUrl.pathname);
    const isAuthRoutes = authRoutes.includes(nextUrl.pathname);

    if(isApiAuthRoute){
        return null;
    }
    if(isAuthRoutes){
        if(isLoggedIn){
            return Response.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
        }
        return null;
    }
    if(!isLoggedIn && !isPublicRoutes){
        return Response.redirect(new URL("/auth/sign-in", nextUrl))
    }
    return null;
});

export const config =
{
    matcher: ["/((?!.+\\.[\\w]+$|_next).*)","/","/(api|trpc)(.*)"],
}