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
import { readSession } from "@/lib/auth";
import { getClassTypes, getPackages } from "@/lib/catalogue";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [types, packages, session] = await Promise.all([
    getClassTypes(),
    getPackages(),
    readSession(),
  ]);

  return (
    <>
      <IntroReveal />
      <Hero />
      <Marquee />
      <Intro />
      <Method />
      <Technogym />
      <ClassesPreview types={types} />
      <TimetablePreview />
      <PricingPreview packages={packages} signedIn={Boolean(session)} />
      <HowItWorks />
      <FaqSection />
      <FinalCta />
    </>
  );
}
