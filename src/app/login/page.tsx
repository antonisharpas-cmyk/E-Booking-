import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { readSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await readSession()) redirect("/account");
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
