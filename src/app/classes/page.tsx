import type { Metadata } from "next";
import { ClassesPageBody } from "@/components/marketing/ClassesPageBody";
import { getClassTypes, getInstructors } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Classes",
  description:
    "Reformer Foundations, Flow, Sculpt, Jumpboard Cardio, Stretch & Restore and Athletic Reformer. Every class is 60 minutes and costs one session.",
};

export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const [types, team] = await Promise.all([getClassTypes(), getInstructors()]);
  return <ClassesPageBody types={types} team={team} />;
}
