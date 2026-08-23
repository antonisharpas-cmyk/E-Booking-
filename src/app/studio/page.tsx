import type { Metadata } from "next";
import { StudioBody } from "@/components/marketing/StudioBody";

export const metadata: Metadata = {
  title: "Studio",
  description:
    "Inside APEX pilates: eight Technogym reformers, capped classes, and a room built for attention. Part of APEX Fitness Centre.",
};

export default function StudioPage() {
  return <StudioBody />;
}
