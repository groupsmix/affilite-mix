export type CalmCategorySlug = "reset-routines" | "somatic-practices" | "reviews";

export type CalmAuthor = {
  id: string;
  name: string;
  bio: string;
  avatarUrl: string;
  credentialLine: string;
};

export type CalmPost = {
  slug: string;
  title: string;
  excerpt: string;
  category: CalmCategorySlug;
  authorId: string;
  publishedAt: string;
  readTimeMinutes: number;
  featuredImage: string;
  seoTitle: string;
  seoDescription: string;
  body: CalmSection[];
};

export type CalmSection = {
  heading: string;
  paragraphs: string[];
  affiliate?: {
    label: string;
    product: string;
    note: string;
  };
};

export const calmAuthor: CalmAuthor = {
  id: "mara",
  name: "Mara Ellison",
  bio: "Mara is a somatic movement educator who spent a decade teaching breath and body-based practices to people navigating chronic stress. She writes about what she has tested herself, sources every claim to published research, and is careful to frame everything as a tool rather than a treatment.",
  avatarUrl: "/images/calmroutine/author-mara.png",
  credentialLine: "Somatic movement educator · 500-hr trained · 10 years teaching",
};

export const calmCategories: Record<
  CalmCategorySlug,
  { slug: CalmCategorySlug; name: string; intro: string }
> = {
  "reset-routines": {
    slug: "reset-routines",
    name: "Reset Routines",
    intro:
      "Short, repeatable sequences for the edges of your day — morning, workday, and evening resets that ask very little and give your nervous system somewhere to land.",
  },
  "somatic-practices": {
    slug: "somatic-practices",
    name: "Somatic Practices",
    intro:
      "Body-first exercises — vagus nerve practices, gentle movement, and breath work you can do in a few minutes without any equipment.",
  },
  reviews: {
    slug: "reviews",
    name: "Reviews",
    intro:
      "Honest, tested-first looks at the tools people reach for when they want to feel calmer. No affiliate link goes in a post I have not tried myself.",
  },
};

export const calmCategoryBadge: Record<
  CalmCategorySlug,
  { label: string; bg: string; text: string }
> = {
  "reset-routines": {
    label: "Reset Routines",
    bg: "bg-cat-routine-bg",
    text: "text-cat-routine-text",
  },
  "somatic-practices": {
    label: "Somatic Practices",
    bg: "bg-cat-somatic-bg",
    text: "text-cat-somatic-text",
  },
  reviews: {
    label: "Reviews",
    bg: "bg-cat-reviews-bg",
    text: "text-cat-reviews-text",
  },
};

export const calmPosts: CalmPost[] = [
  {
    slug: "reset-nervous-system",
    title: "How to reset your nervous system when you feel wired and tired",
    excerpt:
      "A calm, step-by-step routine to move from a stress state back toward rest — using breath, movement, and a little patience. No equipment, five minutes.",
    category: "reset-routines",
    authorId: "mara",
    publishedAt: "2026-06-18",
    readTimeMinutes: 7,
    featuredImage: "/images/calmroutine/post-reset.png",
    seoTitle: "How to reset your nervous system (a 5-minute routine)",
    seoDescription:
      "A gentle, research-informed routine to help your body shift out of a stress state — breath, movement, and grounding you can do anywhere.",
    body: [
      {
        heading: 'What "reset" actually means',
        paragraphs: [
          "When people say they want to reset their nervous system, they usually mean they want to feel less wired. The goal of this routine is not to fix or cure anything — it is to give your body a few clear signals that it is safe to downshift.",
          "These are tools, not treatment. If stress is affecting your daily life, a qualified professional is the right next step. What follows is simply a sequence that many people find grounding.",
        ],
      },
      {
        heading: "Start with a longer exhale",
        paragraphs: [
          "The simplest lever you have is your breath. A slightly longer exhale than inhale gently nudges the body toward its rest response. Breathe in for a count of four, out for a count of six, and repeat for a minute or two.",
          "You do not need to breathe perfectly. If counting feels fussy, just notice that the out-breath is a little longer than the in-breath.",
        ],
      },
      {
        heading: "Add gentle movement",
        paragraphs: [
          "Once your breath has settled, add a slow shoulder roll or a gentle neck stretch. Movement helps discharge the physical tension that stress leaves behind.",
        ],
        affiliate: {
          label: "A tool that helps",
          product: "Cork yoga mat",
          note: "I keep a thin cork mat by my desk so gentle floor movement feels less like a project. This is the one I have used daily for two years.",
        },
      },
      {
        heading: "Close by grounding",
        paragraphs: [
          "Finish by naming three things you can feel — your feet on the floor, the chair against your back, the temperature of the air. Grounding brings your attention back to the present, which is often where calm lives.",
        ],
      },
    ],
  },
  {
    slug: "yoga-for-nervous-system-reset",
    title: "Yoga for a nervous system reset: five poses that ask very little",
    excerpt:
      "Slow, supported shapes that favour rest over effort. A short sequence you can hold for a few breaths each, morning or night.",
    category: "somatic-practices",
    authorId: "mara",
    publishedAt: "2026-06-02",
    readTimeMinutes: 6,
    featuredImage: "/images/calmroutine/post-yoga.png",
    seoTitle: "Yoga for nervous system reset: 5 gentle poses",
    seoDescription:
      "Five supported, low-effort yoga shapes that favour rest — a short sequence to help your body downshift.",
    body: [
      {
        heading: "Rest-first, not effort-first",
        paragraphs: [
          "This is not a workout. Each shape is meant to be comfortable enough that you could stay for several slow breaths. If a pose asks for effort, you have gone too far — back off until it feels supported.",
        ],
      },
      {
        heading: "The five shapes",
        paragraphs: [
          "Legs up the wall, supported child's pose, a gentle reclined twist, cat-cow on all fours, and a simple seated forward fold. Hold each for five to eight breaths, keeping the exhale unhurried.",
        ],
        affiliate: {
          label: "A tool that helps",
          product: "Bolster cushion",
          note: "A firm bolster makes supported shapes genuinely restful. I tested three; this one held its shape the longest.",
        },
      },
    ],
  },
  {
    slug: "morning-routines-for-anxiety",
    title: "Morning routines for anxiety that do not require willpower",
    excerpt:
      "A gentle first hour designed to lower the bar, not raise it. Small, kind steps that make the start of the day feel less sharp.",
    category: "reset-routines",
    authorId: "mara",
    publishedAt: "2026-05-20",
    readTimeMinutes: 8,
    featuredImage: "/images/calmroutine/post-reset.png",
    seoTitle: "Morning routines for anxiety (that need no willpower)",
    seoDescription:
      "A gentle, low-effort morning routine designed to soften anxious mornings — light, breath, water, and movement.",
    body: [
      {
        heading: "Lower the bar on purpose",
        paragraphs: [
          "Anxious mornings are not the time for a demanding routine. The aim here is to make the first hour feel manageable, so each step is deliberately small.",
          "These are supportive tools, not a treatment for anxiety. If mornings feel unmanageable, please reach out to a professional.",
        ],
      },
      {
        heading: "Light, water, breath",
        paragraphs: [
          "Open a curtain for daylight, drink a glass of water, and take a minute of slow breathing before you touch your phone. Three tiny anchors, in any order.",
        ],
      },
    ],
  },
  {
    slug: "somatic-exercises-for-anxiety",
    title: "Somatic exercises for anxiety: a beginner’s toolkit",
    excerpt:
      "Body-based practices — orienting, self-hold, and gentle shaking — that meet anxiety where it lives. Includes a free printable guide.",
    category: "somatic-practices",
    authorId: "mara",
    publishedAt: "2026-05-05",
    readTimeMinutes: 9,
    featuredImage: "/images/calmroutine/post-somatic.png",
    seoTitle: "Somatic exercises for anxiety: a beginner’s toolkit",
    seoDescription:
      "A beginner-friendly set of somatic exercises for anxious moments — orienting, self-hold, and gentle shaking. Free printable included.",
    body: [
      {
        heading: "Meeting anxiety in the body",
        paragraphs: [
          "Somatic work starts from the body rather than the thoughts. These practices are gentle, brief, and meant to give you a felt sense of steadiness — tools you can carry with you.",
        ],
      },
      {
        heading: "Three to start with",
        paragraphs: [
          "Orienting: slowly look around the room and let your eyes rest on something neutral. Self-hold: place one hand on the opposite arm and feel the contact. Gentle shaking: let your hands and arms shake loosely for thirty seconds to release tension.",
        ],
      },
    ],
  },
  {
    slug: "best-weighted-blanket-for-anxiety",
    title: "The best weighted blanket for anxiety, after testing five",
    excerpt:
      "Weight, breathability, and washability — what actually matters, plus the one I keep reaching for on hard evenings.",
    category: "reviews",
    authorId: "mara",
    publishedAt: "2026-04-14",
    readTimeMinutes: 10,
    featuredImage: "/images/calmroutine/post-blanket.png",
    seoTitle: "Best weighted blanket for anxiety (tested, 2026)",
    seoDescription:
      "After testing five weighted blankets, here is what matters — weight, breathability, washability — and the one I recommend.",
    body: [
      {
        heading: "How I tested",
        paragraphs: [
          "I slept under each blanket for at least a week, in a warm room and a cool one, and washed each one twice. I am looking for even weight distribution, a cover that breathes, and a wash that does not clump the filling.",
        ],
      },
      {
        heading: "The one I recommend",
        paragraphs: [
          "For most people, a blanket around 10 percent of body weight, with a breathable cotton cover, is the sweet spot. The pick below balanced weight and breathability better than the rest.",
        ],
        affiliate: {
          label: "My pick",
          product: "Breathable cotton weighted blanket",
          note: "This is the one I reach for. Even weight, a cover that does not overheat, and it survived repeated washing without clumping.",
        },
      },
    ],
  },
];

export type CalmProductCategory = "sleep-and-calm" | "supplements" | "devices";

export type CalmProduct = {
  id: string;
  name: string;
  imageUrl: string;
  oneLineNote: string;
  category: CalmProductCategory;
  priceTier: "$" | "$$" | "$$$";
  destinationUrl: string;
  relatedPostSlug?: string;
};

export const calmProductGroups: {
  category: CalmProductCategory;
  name: string;
  intro: string;
}[] = [
  {
    category: "sleep-and-calm",
    name: "Sleep and calm",
    intro: "The evening tools I actually keep within reach — weight, warmth, and gentle light.",
  },
  {
    category: "supplements",
    name: "Supplements",
    intro: "A short, unglamorous list. Tools that support a routine, never a substitute for one.",
  },
  {
    category: "devices",
    name: "Devices",
    intro:
      "Higher-ticket picks. For these, I would rather you read the full review before you buy.",
  },
];

export const calmProducts: CalmProduct[] = [
  {
    id: "blanket",
    name: "Breathable cotton weighted blanket",
    imageUrl: "/images/calmroutine/product-blanket.png",
    oneLineNote: "Even weight, a cover that breathes — the one I reach for on hard evenings.",
    category: "sleep-and-calm",
    priceTier: "$$",
    destinationUrl:
      "https://www.amazon.com/s?k=cotton+weighted+blanket+10+percent+body+weight+breathable",
    relatedPostSlug: "best-weighted-blanket-for-anxiety",
  },
  {
    id: "tea",
    name: "Calming herbal tea",
    imageUrl: "/images/calmroutine/product-tea.png",
    oneLineNote: "A caffeine-free wind-down ritual — the cue matters as much as the cup.",
    category: "sleep-and-calm",
    priceTier: "$",
    destinationUrl: "https://www.amazon.com/s?k=caffeine+free+herbal+tea+blend+calming",
  },
  {
    id: "lamp",
    name: "Sunrise wake-up light",
    imageUrl: "/images/calmroutine/product-lamp.png",
    oneLineNote: "A gentler start than an alarm — light that eases you awake over 30 minutes.",
    category: "sleep-and-calm",
    priceTier: "$$",
    destinationUrl: "https://www.amazon.com/s?k=sunrise+alarm+clock+wake+up+light",
  },
  {
    id: "magnesium",
    name: "Magnesium glycinate",
    imageUrl: "/images/calmroutine/product-magnesium.png",
    oneLineNote: "A common evening choice. Check with a professional before adding any supplement.",
    category: "supplements",
    priceTier: "$",
    destinationUrl: "https://www.amazon.com/s?k=magnesium+glycinate+supplement",
  },
  {
    id: "vns",
    name: "Vagus nerve stimulation device",
    imageUrl: "/images/calmroutine/product-vns.png",
    oneLineNote: "A considered purchase. Read the review first — this is not for everyone.",
    category: "devices",
    priceTier: "$$$",
    destinationUrl: "https://www.amazon.com/s?k=vagus+nerve+stimulation+device",
    relatedPostSlug: "somatic-exercises-for-anxiety",
  },
  {
    id: "mat",
    name: "Cork yoga mat",
    imageUrl: "/images/calmroutine/product-mat.png",
    oneLineNote: "Thin, grippy, and easy to keep by a desk for a two-minute reset.",
    category: "devices",
    priceTier: "$$",
    destinationUrl: "https://www.amazon.com/s?k=cork+yoga+mat+thin+non+slip",
  },
];

export function getCalmProductsByCategory(category: CalmProductCategory) {
  return calmProducts.filter((p) => p.category === category);
}

export function getCalmPost(slug: string) {
  return calmPosts.find((p) => p.slug === slug);
}

export function getCalmPostsByCategory(category: CalmCategorySlug) {
  return calmPosts.filter((p) => p.category === category);
}

export function formatCalmDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
