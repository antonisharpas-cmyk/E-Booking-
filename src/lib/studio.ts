/**
 * Single place for the studio's real-world details.
 * Replace the placeholders marked TODO with the studio's actual data.
 */
export const STUDIO = {
  name: "APEX pilates",
  parent: "APEX Fitness Centre",
  addressLines: [
    "APEX Fitness Centre",
    "Grigori Afxentiou 9",
    "Livadia, Larnaca 7060",
    "Cyprus",
  ],
  city: "Larnaca",
  /** TODO: confirm the public phone number */
  phone: "+357 22 000 000",
  /** TODO: confirm the public email */
  email: "hello@apexpilates.cy",
  instagram: "https://www.instagram.com/pilatesbyapex/",
  instagramHandle: "@pilatesbyapex",
  facebook: "https://www.facebook.com/profile.php?id=61593707540014",
  /** Paste the studio's Google Maps embed URL to switch the contact map on */
  mapsEmbedUrl: "",
  /* The plain query form of the studio's Maps pin. The link copied out of the
     Maps app carries a long tail of session and telemetry parameters that go
     stale; this resolves to the same place and keeps working. */
  mapsLink:
    "https://www.google.com/maps/search/?api=1&query=Apex+Pilates%2C+Grigori+Afxentiou+9%2C+Livadia%2C+Larnaca+7060",
  /** All class times are shown in the studio's timezone, whoever is looking.
   *  "Asia/Nicosia" is the IANA zone for the whole of Cyprus, Larnaca included. */
  timezone: "Asia/Nicosia",
  /** A class is fifty minutes on the mat, in an hourly slot: the ten minutes
   *  between are the changeover, which is a real part of running five reformers
   *  and not slack. Every generated class, every template and every line of copy
   *  takes its length from here. */
  classLengthMinutes: 50,
  /** Reformers in the room, so the cap on every class */
  capacity: 5,
  /** Monday to Saturday; the studio is closed on Sunday */
  openDays: 6,
} as const;
