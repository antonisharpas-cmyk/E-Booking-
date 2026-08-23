import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { classTypes, creditPackages, instructors } from "@/db/schema";

export async function getClassTypes() {
  return db
    .select()
    .from(classTypes)
    .where(eq(classTypes.active, true))
    .orderBy(asc(classTypes.sortOrder));
}

export async function getClassType(slug: string) {
  return db
    .select()
    .from(classTypes)
    .where(and(eq(classTypes.slug, slug), eq(classTypes.active, true)))
    .get();
}

export async function getPackages() {
  return db
    .select()
    .from(creditPackages)
    .where(eq(creditPackages.active, true))
    .orderBy(asc(creditPackages.sortOrder));
}

export async function getPackageById(id: string) {
  return db.select().from(creditPackages).where(eq(creditPackages.id, id)).get();
}

export async function getInstructors() {
  return db
    .select()
    .from(instructors)
    .where(eq(instructors.active, true))
    .orderBy(asc(instructors.sortOrder));
}
