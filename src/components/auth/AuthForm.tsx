"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Monogram } from "@/components/ui/Monogram";
import { useI18n } from "@/i18n/LanguageProvider";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/account";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);

    const payload =
      mode === "login"
        ? { email: form.get("email"), password: form.get("password") }
        : {
            name: form.get("name"),
            email: form.get("email"),
            phone: form.get("phone"),
            password: form.get("password"),
            marketingOptIn: form.get("marketingOptIn") === "on",
          };

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (data.ok) {
        router.push(next);
        router.refresh();
        return;
      }
      if (data.error === "EMAIL_TAKEN") setError(t.auth.emailTaken);
      else if (data.error === "INVALID_CREDENTIALS") setError(t.auth.invalid);
      else setError(data.error ?? t.common.somethingWrong);
    } catch {
      setError(t.common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <div className="container-x flex min-h-[70vh] items-center justify-center py-16">
      <div className="w-full max-w-md">
        <div className="text-center">
          <Monogram className="mx-auto h-11 w-11 text-clay/60" strokeWidth={2.4} />
          <h1 className="h-display mt-8 text-4xl">
            {isLogin ? t.auth.loginTitle : t.auth.registerTitle}
          </h1>
          <p className="mt-3 text-sm text-mocha-500">
            {isLogin ? t.auth.loginBody : t.auth.registerBody}
          </p>
        </div>

        <form
          onSubmit={submit}
          className="mt-10 rounded-4xl border border-mocha-200/70 bg-white/70 p-8 backdrop-blur-sm"
        >
          <div className="space-y-5">
            {!isLogin && (
              <div>
                <label className="label" htmlFor="name">
                  {t.common.fullName}
                </label>
                <input id="name" name="name" required className="input" />
              </div>
            )}

            <div>
              <label className="label" htmlFor="email">
                {t.common.email}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input"
              />
            </div>

            {!isLogin && (
              <div>
                <label className="label" htmlFor="phone">
                  {t.common.phone}{" "}
                  <span className="text-clay/60">({t.common.optional})</span>
                </label>
                <input id="phone" name="phone" className="input" />
              </div>
            )}

            <div>
              <label className="label" htmlFor="password">
                {t.common.password}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                minLength={isLogin ? undefined : 8}
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                className="input"
              />
              {!isLogin && (
                <p className="mt-2 text-[11px] text-clay">{t.auth.passwordHint}</p>
              )}
            </div>

            {!isLogin && (
              <label className="flex cursor-pointer items-start gap-3 text-[12px] text-mocha-500">
                <input
                  type="checkbox"
                  name="marketingOptIn"
                  className="mt-0.5 h-4 w-4 rounded border-mocha-300 accent-mocha-600"
                />
                {t.auth.marketingOptIn}
              </label>
            )}
          </div>

          {error && (
            <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button type="submit" className="mt-8 w-full" disabled={busy}>
            {busy ? t.common.loading : isLogin ? t.auth.signIn : t.auth.signUp}
          </Button>

          <p className="mt-6 text-center text-[12px] text-mocha-500">
            {isLogin ? t.auth.noAccount : t.auth.hasAccount}{" "}
            <Link
              href={isLogin ? "/register" : "/login"}
              className="link-underline text-mocha-600"
            >
              {isLogin ? t.auth.signUp : t.auth.signIn}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
