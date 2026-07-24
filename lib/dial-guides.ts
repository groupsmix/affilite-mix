import { defaultWatches, type Watch } from "@/lib/dial-config";

export const author = {
  name: "Daniel Osei",
  role: "Lead Watch Reviewer",
  bio: "Daniel has collected and reviewed watches for over 12 years and has hands-on tested more than 400 affordable timepieces. He handles every watch on this list personally before it earns a spot.",
  initials: "DO",
};

export type GuidePick = {
  watchId: string;
  award: string;
  reason: string;
};

export type GuideSection = {
  heading: string;
  body: string;
};

export type GuideFaq = {
  q: string;
  a: string;
};

export type DialGuide = {
  slug: string;
  eyebrow: string;
  h1: string;
  lede: string;
  breadcrumbLabel: string;
  meta: {
    title: string;
    description: string;
    keywords: string[];
  };
  /** Short "why trust us" note shown above the picks. */
  introNote: string;
  picks: GuidePick[];
  buying: {
    title: string;
    lede: string;
    sections: GuideSection[];
  };
  faqs: GuideFaq[];
};

/* ------------------------------------------------------------------ */
/*  Shared buying-guide sections reused across guides                  */
/* ------------------------------------------------------------------ */

const movementSection: GuideSection = {
  heading: "Movement: automatic, quartz, or meca-quartz?",
  body: "Automatics feel special and never need a battery, but cost more and lose a few seconds a day. Quartz is accurate, cheap, and low-maintenance. Meca-quartz is the sweet spot for chronographs — mechanical pusher feel with quartz reliability. There is no wrong answer; buy for how you will actually wear it.",
};

const crystalSection: GuideSection = {
  heading: "Crystal: insist on sapphire",
  body: "The single biggest quality tell at this price is the crystal. Sapphire is virtually scratch-proof; mineral and acrylic are not. If a watch near $300+ still uses mineral glass, that is a red flag.",
};

const caseSection: GuideSection = {
  heading: "Case size: match it to your wrist",
  body: "For most wrists, 36–40mm is the versatile range. Dress watches lean thinner and smaller; dive and chronograph watches wear larger. Measure your wrist before buying — a 44mm watch on a 6-inch wrist looks like a wall clock.",
};

const waterSection: GuideSection = {
  heading: "Water resistance: know what the number means",
  body: "30m means splash-proof only — do not swim in it. 100m handles swimming and showers. 200m is a true dive rating. Ratings are lab-tested static pressure, so treat them conservatively.",
};

/* ------------------------------------------------------------------ */
/*  Guide definitions                                                  */
/* ------------------------------------------------------------------ */

export const dialGuides: DialGuide[] = [
  {
    slug: "best-watches-under-500",
    eyebrow: "Buying Guide",
    h1: "The Best Watches Under $500 in 2026",
    lede: "We spent months wearing and testing dozens of watches to find the six that genuinely deliver more than their price suggests — from a true dive automatic to the perfect dress watch. Here is what earned a spot, and why.",
    breadcrumbLabel: "Best Watches Under $500",
    meta: {
      title: "Best Watches Under $500 (2026) — Tested & Ranked | WristNerd",
      description:
        "The 6 best watches under $500, hands-on tested and ranked. Automatic divers, dress watches, chronographs and more — with pros, cons, and honest buying advice.",
      keywords: [
        "best watches under 500",
        "best watch under 500",
        "best dress watch under 500",
        "best automatic watch under 500",
        "affordable watches",
      ],
    },
    introNote:
      "Every watch below was tested on the wrist for at least two weeks. We checked timekeeping, water resistance, crystal hardness, and strap quality — and we only recommend watches we would happily buy with our own money.",
    picks: [
      {
        watchId: "navigator-automatic",
        award: "Best Overall",
        reason:
          "Nothing else under $500 delivers a true 200m automatic diver with sapphire crystal at this price. It is the one watch here that could genuinely pass for something three times its cost.",
      },
      {
        watchId: "circuit-chrono",
        award: "Best Chronograph",
        reason:
          "The meca-quartz movement gives you the crisp, mechanical-feeling pusher action of a chronograph costing four figures, wrapped in a legible panda dial.",
      },
      {
        watchId: "sterling-dress",
        award: "Best Dress Watch",
        reason:
          "At 6.5mm thick it disappears under a shirt cuff. For weddings, interviews, and the office, this is the most elegant option on the list.",
      },
      {
        watchId: "heritage-field",
        award: "Best Everyday Value",
        reason:
          "A do-everything field watch with a premium leather strap and hand-wound mechanical charm. The one we reach for most on ordinary days.",
      },
      {
        watchId: "aria-minimalist",
        award: "Best Minimalist",
        reason:
          "A refined 34mm case and mesh strap that dresses up or down effortlessly — our top pick for anyone who wants clean, understated style.",
      },
      {
        watchId: "retro-digital",
        award: "Best Budget Beater",
        reason:
          "Iconic, nearly indestructible, and absurdly cheap. The perfect knock-around watch and a gateway into the hobby.",
      },
    ],
    buying: {
      title: "How to choose a watch under $500",
      lede: "Four things separate a great sub-$500 watch from a forgettable one. Here is exactly what we look for when we test.",
      sections: [movementSection, crystalSection, caseSection, waterSection],
    },
    faqs: [
      {
        q: "What is the best watch under $500 overall?",
        a: "Our top overall pick is the Meridian Navigator Automatic. It is the only watch in this price range that combines a true 200m dive rating, an automatic movement, and a scratch-resistant sapphire crystal — a specification that usually costs far more.",
      },
      {
        q: "Are automatic watches under $500 any good?",
        a: "Yes. Modern affordable automatics use reliable, well-proven movements that keep good time and are serviceable. You will not get in-house haute horlogerie, but for everyday accuracy and the pleasure of a self-winding watch, several options under $500 are excellent.",
      },
      {
        q: "Should I buy quartz or automatic at this price?",
        a: "Buy quartz if you want set-and-forget accuracy, the lowest maintenance, and the thinnest cases. Buy automatic if you value the craft, the sweeping seconds hand, and never needing a battery. Both are great choices under $500.",
      },
      {
        q: "How do you test and rank these watches?",
        a: "We buy or borrow every watch and wear each one for at least two weeks. We check timekeeping accuracy, water resistance, crystal hardness, strap and bracelet quality, and real-world comfort. Rankings are never influenced by affiliate commissions.",
      },
      {
        q: "Do these prices include shipping and tax?",
        a: "No. Listed prices are approximate typical retail and can change often. Always confirm the current price, shipping, and any tax on the retailer’s page before buying — tap “Check price” for the latest figure.",
      },
    ],
  },
  {
    slug: "best-watches-under-300",
    eyebrow: "Buying Guide",
    h1: "The Best Watches Under $300 in 2026",
    lede: "The $300 mark is the affordable-watch sweet spot — enough for sapphire crystals, quality straps, and genuinely good design without overspending. These are the four we recommend without hesitation.",
    breadcrumbLabel: "Best Watches Under $300",
    meta: {
      title: "Best Watches Under $300 (2026) — Tested & Ranked | WristNerd",
      description:
        "The best watches under $300, hands-on tested and ranked. Field, dress, minimalist and budget picks with pros, cons, and honest buying advice.",
      keywords: [
        "best watches under 300",
        "best watch under 300",
        "affordable watches under 300",
        "best cheap watches",
      ],
    },
    introNote:
      "Everything on this list costs under $300 and has been worn and tested for at least two weeks. We only recommend watches we would happily buy with our own money.",
    picks: [
      {
        watchId: "sterling-dress",
        award: "Best Overall",
        reason:
          "The most versatile watch under $300 we tested. Ultra-thin, elegant, and priced so well it feels like a mistake — it works for the office, a wedding, or dinner out.",
      },
      {
        watchId: "heritage-field",
        award: "Best Everyday Value",
        reason:
          "A crisp, legible mechanical field watch with a leather strap that feels premium out of the box. The one we reach for most on ordinary days.",
      },
      {
        watchId: "aria-minimalist",
        award: "Best Minimalist",
        reason:
          "A refined 34mm case and mesh strap that dresses up or down effortlessly — our top pick for understated, clean style on a budget.",
      },
      {
        watchId: "retro-digital",
        award: "Best Budget Beater",
        reason:
          "Iconic, nearly indestructible, and absurdly cheap. The perfect knock-around watch and a gateway into the hobby.",
      },
    ],
    buying: {
      title: "How to choose a watch under $300",
      lede: "At this price you can be picky. Here is exactly what we look for when deciding whether a sub-$300 watch earns a recommendation.",
      sections: [movementSection, crystalSection, caseSection, waterSection],
    },
    faqs: [
      {
        q: "What is the best watch under $300 overall?",
        a: "Our top pick is the Aveline Sterling Slim. At just 6.5mm thick with an elegant dial, it is the most versatile watch we tested under $300 — equally at home at the office or a formal event.",
      },
      {
        q: "Can you get a good automatic watch under $300?",
        a: "Yes. Mechanical and automatic watches exist comfortably under $300, like the Ridgeline Heritage Field. You will not get an in-house movement, but you get reliable, serviceable mechanics and real character.",
      },
      {
        q: "Is $300 enough for a sapphire crystal?",
        a: "Often, yes — and you should look for it. Sapphire is virtually scratch-proof and increasingly common in this range. If a watch near $300 still uses mineral glass, weigh that against the rest of its specs.",
      },
      {
        q: "How do you test and rank these watches?",
        a: "We buy or borrow every watch and wear each one for at least two weeks, checking accuracy, water resistance, crystal hardness, and strap quality. Rankings are never influenced by affiliate commissions.",
      },
    ],
  },
  {
    slug: "best-dress-watch-under-500",
    eyebrow: "Buying Guide",
    h1: "The Best Dress Watches Under $500 in 2026",
    lede: "A great dress watch is thin, understated, and quietly elegant — the kind of piece that slips under a cuff and elevates a suit. These are the three that nail the brief without breaking $500.",
    breadcrumbLabel: "Best Dress Watch Under $500",
    meta: {
      title: "Best Dress Watch Under $500 (2026) — Tested & Ranked | WristNerd",
      description:
        "The best dress watches under $500, hands-on tested and ranked. Thin, elegant picks for weddings, the office and formal wear — with pros, cons, and buying advice.",
      keywords: [
        "best dress watch under 500",
        "best dress watches under 500",
        "affordable dress watch",
        "thin dress watch",
        "elegant watch under 500",
      ],
    },
    introNote:
      "Every dress watch below was worn and tested for at least two weeks under real cuffs. We judged thinness, dial elegance, strap quality, and how well each disappears when it should.",
    picks: [
      {
        watchId: "sterling-dress",
        award: "Best Overall Dress Watch",
        reason:
          "At just 6.5mm thick with dauphine hands and a clean dial, this is the definitive sub-$500 dress watch. It slips under any cuff and looks far more expensive than it is.",
      },
      {
        watchId: "aria-minimalist",
        award: "Best Minimalist Dress Watch",
        reason:
          "A refined 34mm case with a mesh strap and a bare, elegant dial. For a modern, understated formal look — and a superb gift — nothing here beats it.",
      },
      {
        watchId: "heritage-field",
        award: "Best Casual-Dress Crossover",
        reason:
          "On its leather strap this field watch is dressy enough for smart-casual offices and dinners, while staying rugged enough for everyday wear. The most flexible pick of the three.",
      },
    ],
    buying: {
      title: "How to choose a dress watch under $500",
      lede: "A dress watch has one job: to look effortless and refined. Here is what actually matters when you are choosing one.",
      sections: [
        {
          heading: "Thinness is everything",
          body: "The defining trait of a dress watch is how well it hides under a shirt cuff. Aim for a case under about 9mm thick. The thinner it is, the dressier and more expensive it feels — our top pick is just 6.5mm.",
        },
        {
          heading: "Keep the dial clean",
          body: "Dress watches favour restraint: simple indices or slim numerals, two or three hands, and minimal text. Skip chunky bezels, tachymeters, and busy subdials — those belong on sport watches.",
        },
        {
          heading: "Strap over bracelet",
          body: "A slim leather strap reads far dressier than a steel bracelet. Black or dark brown leather is the safest formal choice; a fine mesh strap works for a modern minimalist look.",
        },
        {
          heading: "Size down",
          body: "Dress watches wear smaller than sport watches — 34–40mm suits most wrists. A smaller, thinner case looks more elegant and vintage-correct than an oversized one.",
        },
      ],
    },
    faqs: [
      {
        q: "What is the best dress watch under $500?",
        a: "Our top pick is the Aveline Sterling Slim. At 6.5mm thick with dauphine hands and a minimalist dial, it delivers the thin, elegant look of a much more expensive dress watch.",
      },
      {
        q: "How thin should a dress watch be?",
        a: "Ideally under about 9mm so it slips easily under a shirt cuff. The thinner the case, the dressier and more refined the watch looks. Our top pick measures just 6.5mm.",
      },
      {
        q: "Should a dress watch be quartz or automatic?",
        a: "Either works. Quartz lets a watch be thinner and lower-maintenance, which suits the dress category well. Automatic adds craft and a sweeping seconds hand. For pure elegance and thinness, quartz is often the smarter choice under $500.",
      },
      {
        q: "Is a leather strap or bracelet more formal?",
        a: "A slim leather strap in black or dark brown is the most formal option. A steel bracelet reads sportier and more casual. A fine mesh strap sits in between and works well for a modern minimalist dress look.",
      },
    ],
  },
  {
    slug: "best-watches-under-200",
    eyebrow: "Buying Guide",
    h1: "The Best Watches Under $200 in 2026",
    lede: "You do not need to spend a lot to get a capable, characterful watch. The best sub-$200 picks combine honest specs, real-world durability, and enough style to wear anywhere.",
    breadcrumbLabel: "Best Watches Under $200",
    meta: {
      title: "Best Watches Under $200 (2026) — Tested & Ranked | WristNerd",
      description:
        "The best watches under $200, hands-on tested and ranked. Field, minimalist, vintage-style and budget beater picks with pros, cons, and honest buying advice.",
      keywords: [
        "best watches under 200",
        "best watch under 200",
        "affordable watches under 200",
        "budget watches",
        "cheap mechanical watch",
      ],
    },
    introNote:
      "Every watch on this list costs under $200 and has been worn for at least two weeks. We focused on reliability, comfort, and whether the watch actually feels good on the wrist — not just in photos.",
    picks: [
      {
        watchId: "heritage-field",
        award: "Best Overall",
        reason:
          "A hand-wound mechanical field watch with excellent legibility and a leather strap that feels far more expensive than the price. It has real character without the usual budget-watch compromises.",
      },
      {
        watchId: "aria-minimalist",
        award: "Best Minimalist",
        reason:
          "A refined 34mm case and mesh strap that dresses up or down effortlessly. It is our top pick for understated, clean style on a tight budget and makes a great gift.",
      },
      {
        watchId: "retro-digital",
        award: "Best Budget Beater",
        reason:
          "Iconic, nearly indestructible, and absurdly cheap. The perfect knock-around watch, gym companion, or gateway into the hobby without worry.",
      },
    ],
    buying: {
      title: "How to choose a watch under $200",
      lede: "At this price, focus on reliability, comfort, and style that matches how you will actually wear the watch. Here is what we look for when testing sub-$200 timepieces.",
      sections: [
        movementSection,
        {
          heading: "Crystal and case finish",
          body: "Sapphire is rare under $200, so expect mineral glass or acrylic. Check reviews for scratch resistance and how well the case finish holds up after a few weeks of daily wear. A clean dial and decent lume matter more than brand prestige.",
        },
        caseSection,
        waterSection,
      ],
    },
    faqs: [
      {
        q: "What is the best watch under $200 overall?",
        a: "Our top pick is the Ridgeline Heritage Field 38. It offers a mechanical movement, excellent legibility, and a quality leather strap — a rare combination under $200.",
      },
      {
        q: "Can you get an automatic watch under $200?",
        a: "Yes, but be selective. Automatics under $200 exist from brands like Seiko, Orient, and a few microbrands. Expect simpler movements and mineral crystals, but many are reliable with regular servicing.",
      },
      {
        q: "Are cheap watches durable?",
        a: "Durability depends on construction, not price. We test water resistance claims, strap hardware, and case finish. Some sub-$100 watches are surprisingly tough, while others show wear within weeks.",
      },
      {
        q: "How do you test and rank these watches?",
        a: "We buy or borrow every watch and wear each one for at least two weeks, checking accuracy, comfort, crystal durability, strap quality, and water resistance. Rankings are never influenced by affiliate commissions.",
      },
    ],
  },
];

export function getDialGuide(slug: string): DialGuide | undefined {
  return dialGuides.find((g) => g.slug === slug);
}

export function getDialGuidePicks(guide: DialGuide, watches: Watch[] = defaultWatches) {
  return guide.picks
    .map((p) => {
      const watch = watches.find((w) => w.id === p.watchId);
      return watch ? { ...p, watch } : null;
    })
    .filter((x): x is GuidePick & { watch: Watch } => x !== null);
}
