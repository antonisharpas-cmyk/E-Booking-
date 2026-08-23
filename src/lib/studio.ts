/**
 * Single place for the studio's real-world details.
 * Replace the placeholders marked TODO with the studio's actual data.
 */
export const STUDIO = {
  name: "APEX pilates",
  parent: "APEX Fitness Centre",
  /** TODO: confirm the street address */
  addressLines: ["APEX Fitness Centre", "Nicosia", "Cyprus"],
  /** TODO: confirm the public phone number */
  phone: "+357 22 000 000",
  /** TODO: confirm the public email */
  email: "hello@apexpilates.cy",
  instagram: "https://www.instagram.com/pilatesbyapex/",
  /** Paste the studio's Google Maps embed URL to switch the contact map on */
  mapsEmbedUrl: "",
  mapsLink: "https://maps.google.com/?q=APEX+Fitness+Centre+Nicosia",
  /** All class times are shown in the studio's timezone, whoever is looking. */
  timezone: "Asia/Nicosia",
  classLengthMinutes: 50,
  capacity: 8,
} as const;
