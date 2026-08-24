"use client";

import { Section } from "@/components/ui/Section";
import { useI18n } from "@/i18n/LanguageProvider";

/**
 * Starting templates. Replace the body copy with the studio's final wording —
 * this is not legal advice and has not been reviewed by a lawyer.
 */
export function LegalBody({ kind }: { kind: "privacy" | "terms" }) {
  const { t, locale } = useI18n();
  const el = locale === "el";

  const privacy = el
    ? [
        ["Ποια δεδομένα συλλέγουμε", "Όνομα, email, τηλέφωνο, ιστορικό κρατήσεων και ιστορικό αγορών. Τα στοιχεία κάρτας δεν αποθηκεύονται ποτέ στους διακομιστές μας. Η πληρωμή γίνεται εξ ολοκλήρου μέσω του παρόχου πληρωμών."],
        ["Γιατί", "Για να διαχειριστούμε τις κρατήσεις, τα credits και τις πληρωμές σου, και για να επικοινωνήσουμε μαζί σου σχετικά με το μάθημά σου."],
        ["Πόσο", "Όσο διατηρείς λογαριασμό. Μπορείς να ζητήσεις διαγραφή οποτεδήποτε."],
        ["Τα δικαιώματά σου", "Πρόσβαση, διόρθωση, διαγραφή και φορητότητα των δεδομένων σου, σύμφωνα με τον GDPR."],
        ["Επικοινωνία", "Για οποιοδήποτε αίτημα σχετικά με τα δεδομένα σου, επικοινώνησε με το στούντιο."],
      ]
    : [
        ["What we collect", "Your name, email, phone, booking history and purchase history. Card details are never stored on our servers. Payment is handled entirely by our payment provider."],
        ["Why", "To manage your bookings, credits and payments, and to contact you about your classes."],
        ["How long", "For as long as you keep an account. You can request deletion at any time."],
        ["Your rights", "Access, correction, deletion and portability of your data under GDPR."],
        ["Contact", "For any request about your data, contact the studio."],
      ];

  const terms = el
    ? [
        ["Credits", "Ένα credit αντιστοιχεί σε ένα μάθημα. Τα credits αφαιρούνται κατά την κράτηση και έχουν ημερομηνία λήξης που εμφανίζεται πριν την αγορά."],
        ["Ακυρώσεις", "Δωρεάν ακύρωση έως 12 ώρες πριν την έναρξη. Μετά από αυτό το credit καταναλώνεται."],
        ["Καθυστερημένη άφιξη", "Για ασφάλεια, η είσοδος δεν επιτρέπεται μετά την έναρξη της προθέρμανσης."],
        ["Επιστροφές χρημάτων", "Τα πακέτα δεν επιστρέφονται χρηματικά, εκτός όπου απαιτείται από τον νόμο."],
        ["Υγεία", "Ενημέρωσε το στούντιο για τραυματισμούς, εγκυμοσύνη ή ιατρικές καταστάσεις πριν το μάθημα."],
      ]
    : [
        ["Credits", "One credit equals one class. Credits are deducted at the time of booking and carry an expiry date shown before purchase."],
        ["Cancellations", "Free cancellation up to 12 hours before the class starts. After that the credit is used."],
        ["Late arrival", "For safety, entry is not permitted once the warm-up has begun."],
        ["Refunds", "Credit packs are non-refundable except where required by law."],
        ["Health", "Tell the studio about injuries, pregnancy or medical conditions before class."],
      ];

  const items = kind === "privacy" ? privacy : terms;

  return (
    <Section className="pt-12 md:pt-16">
      <div className="container-x max-w-3xl">
        <p className="eyebrow mb-5">{t.footer.legal}</p>
        <h1 className="h-display text-[2.4rem] leading-tight sm:text-5xl">
          {kind === "privacy" ? t.legal.privacyTitle : t.legal.termsTitle}
        </h1>
        <p className="mt-6 rounded-2xl border border-gold/40 bg-[#FBF6E7] px-5 py-4 text-[13px] text-mocha-700">
          {t.legal.placeholder}
        </p>

        <div className="mt-12 space-y-10">
          {items.map(([title, body]) => (
            <div key={title} className="border-t border-mocha-200/70 pt-8">
              <h2 className="text-[13px] uppercase tracking-widest">{title}</h2>
              <p className="mt-3 text-[15px] leading-[1.9] text-mocha-500">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
