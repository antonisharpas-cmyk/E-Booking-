import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Footer } from "@/components/site/Footer";
import { Header, type HeaderUser } from "@/components/site/Header";
import {
  DEFAULT_LOCALE,
  dictionaries,
  LOCALE_COOKIE,
  type Locale,
} from "@/i18n/dictionaries";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { currentUser } from "@/lib/auth";
import { getAvailableCredits } from "@/lib/credits";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "APEX pilates | Reformer Pilates by APEX Fitness Centre",
    template: "%s · APEX pilates",
  },
  description: dictionaries.en.meta.description,
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  icons: { icon: "/brand/logo-512.png", apple: "/brand/logo-512.png" },
  openGraph: {
    title: "APEX pilates | Reformer Pilates by APEX Fitness Centre",
    description: dictionaries.en.meta.description,
    type: "website",
    images: ["/brand/logo-square.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#5B4645",
};

async function readLocale(): Promise<Locale> {
  const jar = await cookies();
  const v = jar.get(LOCALE_COOKIE)?.value;
  return v === "el" ? "el" : DEFAULT_LOCALE;
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await readLocale();
  const user = await currentUser();

  const headerUser: HeaderUser = user
    ? {
        name: user.name,
        role: user.role,
        credits: await getAvailableCredits(user.id),
      }
    : null;

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Jost carries the geometric feel of the wordmark; Cormorant is the
            editorial display face. Swap to next/font later if you prefer the
            fonts self-hosted — see README. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Jost:wght@200;300;400;500&family=Cormorant+Garamond:wght@300;400;500&family=Marcellus&display=swap"
          rel="stylesheet"
        />
        <style
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html:
              `:root{--font-jost:'Jost';--font-cormorant:'Cormorant Garamond';` +
              /* the headline face, closest to the flare of the wordmark */
              `--font-wordmark:'Marcellus';}`,
          }}
        />
      </head>
      <body className="min-h-dvh bg-cream">
        <LanguageProvider initialLocale={locale}>
          <Header user={headerUser} />
          <main className="pt-24">{children}</main>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
