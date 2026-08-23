import type { Metadata } from "next";
import { ClassesPageBody } from "@/components/marketing/ClassesPageBody";
import { getClassTypes, getInstructors } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Classes",
  description:
    "Reformer Foundations, Flow, Sculpt, Jumpboard Cardio, Stretch & Restore and Athletic Reformer — every class 50 minutes, one credit.",
};

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const [types, team] = await Promise.all([getClassTypes(), getInstructors()]);
  return <ClassesPageBody types={types} team={team} />;
}
