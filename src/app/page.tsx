import {
  ClassesPreview,
  FaqSection,
  PricingPreview,
} from "@/components/home/CatalogueSections";
import { Hero } from "@/components/home/Hero";
import { IntroReveal } from "@/components/home/IntroReveal";
import {
  FinalCta,
  HowItWorks,
  Intro,
  Marquee,
  Method,
  Technogym,
  TimetablePreview,
} from "@/components/home/HomeSections";
import { currentUser } from "@/lib/auth";
import { hasAvatar } from "@/lib/avatars";
import { getAvailableCredits } from "@/lib/credits";
import { getClassTypes, getPackages } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [types, packages, user] = await Promise.all([
    getClassTypes(),
    getPackages(),
    currentUser(),
  ]);

  /* The cover carries its own account row, because the header hides its chip
     over this section. Two extra reads, and only when somebody is signed in. */
  const heroUser = user
    ? {
        name: user.name,
        hasPhoto: await hasAvatar(user.id),
        credits: await getAvailableCredits(user.id),
      }
    : null;

  return (
    <>
      <IntroReveal />
      <Hero user={heroUser} />
      <Marquee />
      <Intro />
      <Method />
      <Technogym />
      <ClassesPreview types={types} />
      <TimetablePreview />
      <PricingPreview packages={packages} signedIn={Boolean(user)} />
      <HowItWorks />
      <FaqSection />
      <FinalCta />
    </>
  );
}
