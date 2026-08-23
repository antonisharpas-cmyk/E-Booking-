import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { readSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await readSession()) redirect("/account");
  return (
    <Suspense>
      <AuthForm mode="register" />
    </Suspense>
  );
}
