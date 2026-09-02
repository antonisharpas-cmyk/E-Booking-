/**
 * The terms and the privacy notice, as text, in both languages.
 *
 * These used to live inside `components/marketing/LegalBody.tsx`, which was fine
 * for as long as the only place anybody read them was the page. Sign-up now asks
 * members to accept them before the account is created, and it has to show them
 * the same words: a checkbox saying "I accept the terms" next to a link that
 * opens a different document is not consent to anything.
 *
 * So the text is here and the page is one of two readers. There is exactly one
 * copy of it, and neither reader can drift from the other.
 *
 * NOT LEGAL ADVICE. This is a starting template and has not been reviewed by a
 * lawyer. The studio should replace the body copy with its own final wording
 * before going live; the shape it is in here is the shape both readers expect.
 */

export type LegalKind = "privacy" | "terms";

/** One heading and its paragraph. */
export type LegalSection = { title: string; body: string };

const PRIVACY_EN: LegalSection[] = [
  {
    title: "What we collect",
    body: "Your name, email, phone, booking history and purchase history, and what you tell us about your pilates experience and any condition we should know about. Card details are never stored on our servers. Payment is handled entirely by our payment provider.",
  },
  {
    title: "Why",
    body: "To manage your bookings, sessions and payments, to contact you about your classes, and so that whoever is teaching can keep you safe in the room.",
  },
  {
    title: "How long",
    body: "Your account details, for as long as you keep an account. You can ask us to delete them at any time, and we will.\n\nYour payments and class history are different: they are accounting records, and we are required to keep them for seven years and to archive them for a further seven, fourteen years in all. When you ask to be forgotten we remove everything that identifies you and leave those records with no person attached to them, because keeping the invoice is an obligation we cannot set aside and identifying you in it is not.",
  },
  {
    title: "Your rights",
    body: "Access, correction, deletion and portability of your data under GDPR.",
  },
  {
    title: "Contact",
    body: "For any request about your data, contact the studio.",
  },
];

const PRIVACY_EL: LegalSection[] = [
  {
    title: "Ποια δεδομένα συλλέγουμε",
    body: "Όνομα, email, τηλέφωνο, ιστορικό κρατήσεων και ιστορικό αγορών, και όσα μας πεις για την εμπειρία σου στο pilates και για οποιαδήποτε πάθηση πρέπει να γνωρίζουμε. Τα στοιχεία κάρτας δεν αποθηκεύονται ποτέ στους διακομιστές μας. Η πληρωμή γίνεται εξ ολοκλήρου μέσω του παρόχου πληρωμών.",
  },
  {
    title: "Γιατί",
    body: "Για να διαχειριστούμε τις κρατήσεις, τις συνεδρίες και τις πληρωμές σου, για να επικοινωνήσουμε μαζί σου σχετικά με το μάθημά σου, και ώστε όποιος διδάσκει να μπορεί να σε κρατήσει ασφαλή στην αίθουσα.",
  },
  {
    title: "Πόσο",
    body: "Τα στοιχεία του λογαριασμού σου, όσο διατηρείς λογαριασμό. Μπορείς να ζητήσεις τη διαγραφή τους οποτεδήποτε και θα γίνει.\n\nΟι πληρωμές και το ιστορικό μαθημάτων είναι διαφορετικά: είναι λογιστικά αρχεία και είμαστε υποχρεωμένοι να τα κρατήσουμε επτά χρόνια και να τα αρχειοθετήσουμε για άλλα επτά, δεκατέσσερα χρόνια συνολικά. Όταν ζητήσεις να διαγραφείς, αφαιρούμε όλα όσα σε ταυτοποιούν και αφήνουμε αυτά τα αρχεία χωρίς πρόσωπο συνδεδεμένο με αυτά, γιατί η διατήρηση του τιμολογίου είναι υποχρέωση που δεν μπορούμε να παραβλέψουμε, ενώ η ταυτοποίησή σου σε αυτό δεν είναι.",
  },
  {
    title: "Τα δικαιώματά σου",
    body: "Πρόσβαση, διόρθωση, διαγραφή και φορητότητα των δεδομένων σου, σύμφωνα με τον GDPR.",
  },
  {
    title: "Επικοινωνία",
    body: "Για οποιοδήποτε αίτημα σχετικά με τα δεδομένα σου, επικοινώνησε με το στούντιο.",
  },
];

const TERMS_EN: LegalSection[] = [
  {
    title: "Sessions",
    body: "One session buys one class. Sessions are deducted at the time of booking and carry an expiry date, shown before you buy. Sessions are always spent from the package that expires soonest.",
  },
  {
    title: "Cancellations",
    body: "Free cancellation up to 12 hours before the class starts, and the session returns to your balance. After that the session is used. Personal and Duet appointments close at the end of the day before, because an instructor is asked to come in for that slot.",
  },
  {
    title: "Refunds",
    body: "Sessions are not refundable in money. Cancelling a class returns the session to your balance to spend on another class; it is not a refund. Sessions that expire unused are not refunded or extended, and if you decide to stop coming, whatever is left in your balance cannot be paid back.",
  },
  {
    title: "Late arrival",
    body: "For safety, entry is not permitted once the warm-up has begun.",
  },
  {
    title: "Health",
    body: "Tell the studio about injuries, pregnancy or medical conditions before class. You can record them on your account, and you can change them whenever they change.",
  },
];

const TERMS_EL: LegalSection[] = [
  {
    title: "Συνεδρίες",
    body: "Μία συνεδρία αντιστοιχεί σε ένα μάθημα. Οι συνεδρίες αφαιρούνται κατά την κράτηση και έχουν ημερομηνία λήξης, που εμφανίζεται πριν την αγορά. Οι συνεδρίες χρησιμοποιούνται πάντα από το πακέτο που λήγει πρώτο.",
  },
  {
    title: "Ακυρώσεις",
    body: "Δωρεάν ακύρωση έως 12 ώρες πριν την έναρξη, και η συνεδρία επιστρέφει στο υπόλοιπό σου. Μετά από αυτό η συνεδρία χρεώνεται. Οι Ατομικές και οι Duet κλείνουν στο τέλος της προηγούμενης μέρας, γιατί καλείται εκπαιδευτής για εκείνη την ώρα.",
  },
  {
    title: "Επιστροφές χρημάτων",
    body: "Οι συνεδρίες δεν επιστρέφονται σε χρήμα. Η ακύρωση ενός μαθήματος επιστρέφει τη συνεδρία στο υπόλοιπό σου για άλλο μάθημα· δεν είναι επιστροφή χρημάτων. Οι συνεδρίες που λήγουν αχρησιμοποίητες δεν επιστρέφονται ούτε παρατείνονται, και αν αποφασίσεις να σταματήσεις, ό,τι έχει μείνει στο υπόλοιπό σου δεν αποδίδεται σε χρήμα.",
  },
  {
    title: "Καθυστερημένη άφιξη",
    body: "Για ασφάλεια, η είσοδος δεν επιτρέπεται μετά την έναρξη της προθέρμανσης.",
  },
  {
    title: "Υγεία",
    body: "Ενημέρωσε το στούντιο για τραυματισμούς, εγκυμοσύνη ή ιατρικές καταστάσεις πριν το μάθημα. Μπορείς να τα καταγράψεις στον λογαριασμό σου και να τα αλλάξεις όποτε αλλάζουν.",
  },
];

/** The sections of one document, in one language. */
export function legalSections(
  kind: LegalKind,
  locale: string,
): LegalSection[] {
  const el = locale === "el";
  if (kind === "privacy") return el ? PRIVACY_EL : PRIVACY_EN;
  return el ? TERMS_EL : TERMS_EN;
}
