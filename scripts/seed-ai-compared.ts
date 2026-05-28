#!/usr/bin/env tsx
/**
 * Seed script for the "AI Compared" site (aicompared.site).
 *
 * Populates the AI-for-creators/marketers niche: categories, AI-tool products
 * (each scored with the 0–10 "AI Value Score"), and review / comparison / guide
 * content, wired together through the content_products join table.
 *
 * Idempotent — safe to run multiple times (upserts by slug).
 *
 * Usage:
 *   npm run seed:ai-compared
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL env vars.
 *
 * NOTE: affiliate_url values are the tools' official URLs as placeholders.
 * Replace them with your real affiliate tracking links once you're approved
 * into each program (Impact, PartnerStack, Rewardful, FirstPromoter).
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Site ───────────────────────────────────────────────────────────────
// Domain matches config/sites/ai-compared.ts. If the live domain is
// compareai.site, update both this value and the config.
const SITE = {
  slug: "ai-compared",
  name: "AI Compared",
  domain: "aicompared.site",
  language: "en",
  direction: "ltr" as const,
};

// ── Categories (hubs) ────────────────────────────────────────────────────
const categories = [
  {
    slug: "ai-writing",
    name: "AI Writing",
    description: "AI writing assistants and copy generators for content and marketing teams.",
    taxonomy_type: "general" as const,
  },
  {
    slug: "ai-video",
    name: "AI Video & Avatars",
    description:
      "AI video generators and avatar tools that turn scripts into studio-quality video.",
    taxonomy_type: "general" as const,
  },
  {
    slug: "ai-voice",
    name: "AI Voice",
    description: "AI voice and text-to-speech tools for voiceovers, narration, and dubbing.",
    taxonomy_type: "general" as const,
  },
  {
    slug: "ai-seo",
    name: "AI SEO & Marketing",
    description: "AI-powered SEO and marketing platforms for research, optimization, and growth.",
    taxonomy_type: "general" as const,
  },
];

// ── Products (AI tools) — score is the 0–10 AI Value Score ────────────────
interface ProductSeed {
  slug: string;
  name: string;
  category: string; // category slug
  description: string;
  affiliate_url: string;
  merchant: string;
  price: string;
  price_amount: number;
  score: number; // 0–10
  featured: boolean;
  cta_text: string;
  pros: string;
  cons: string;
}

const products: ProductSeed[] = [
  // AI Writing
  {
    slug: "jasper-ai",
    name: "Jasper AI",
    category: "ai-writing",
    description:
      "Enterprise-grade AI writing and marketing copilot with brand voice, templates, and team workflows.",
    affiliate_url: "https://www.jasper.ai/",
    merchant: "Jasper",
    price: "From $49/mo",
    price_amount: 49,
    score: 8.7,
    featured: true,
    cta_text: "Try Jasper",
    pros: "Strong brand-voice controls, Marketing-focused templates, Solid team features, 25–30% recurring affiliate program",
    cons: "Pricier than rivals, Overkill for solo casual users",
  },
  {
    slug: "writesonic",
    name: "Writesonic",
    category: "ai-writing",
    description:
      "Affordable AI writer with SEO-friendly article generation, chat, and a generous free tier.",
    affiliate_url: "https://writesonic.com/",
    merchant: "Writesonic",
    price: "From $20/mo",
    price_amount: 20,
    score: 8.4,
    featured: false,
    cta_text: "Try Writesonic",
    pros: "Great value for money, SEO article workflows, Free tier to start, 30% recurring commission",
    cons: "Output needs editing on long form, UI can feel busy",
  },
  {
    slug: "copy-ai",
    name: "Copy.ai",
    category: "ai-writing",
    description:
      "AI copywriter built around go-to-market workflows, with strong short-form and sales copy.",
    affiliate_url: "https://www.copy.ai/",
    merchant: "Copy.ai",
    price: "From $49/mo",
    price_amount: 49,
    score: 8.1,
    featured: false,
    cta_text: "Try Copy.ai",
    pros: "Excellent short-form copy, GTM workflow automations, Free plan available",
    cons: "Long-form weaker than Jasper, Fewer brand-voice controls",
  },
  // AI Video & Avatars
  {
    slug: "heygen",
    name: "HeyGen",
    category: "ai-video",
    description:
      "AI avatar video platform that turns scripts into talking-head videos with realistic avatars and voice cloning.",
    affiliate_url: "https://www.heygen.com/",
    merchant: "HeyGen",
    price: "From $29/mo",
    price_amount: 29,
    score: 9.0,
    featured: true,
    cta_text: "Try HeyGen",
    pros: "Highly realistic avatars, Fast rendering, Voice cloning, 20–30% recurring commission",
    cons: "Credits run out on heavy use, Custom avatars cost extra",
  },
  {
    slug: "synthesia",
    name: "Synthesia",
    category: "ai-video",
    description:
      "Enterprise AI video generator for training and explainer content, with 230+ avatars and 140+ languages.",
    affiliate_url: "https://www.synthesia.io/",
    merchant: "Synthesia",
    price: "From $29/mo",
    price_amount: 29,
    score: 8.8,
    featured: true,
    cta_text: "Try Synthesia",
    pros: "Polished for L&D/corporate, Huge language support, Reliable output",
    cons: "Less flexible for casual creators, Higher entry price",
  },
  // AI Voice
  {
    slug: "elevenlabs",
    name: "ElevenLabs",
    category: "ai-voice",
    description:
      "Best-in-class AI voice generation and cloning with natural prosody across dozens of languages.",
    affiliate_url: "https://elevenlabs.io/",
    merchant: "ElevenLabs",
    price: "From $5/mo",
    price_amount: 5,
    score: 9.2,
    featured: true,
    cta_text: "Try ElevenLabs",
    pros: "Most natural voices, Excellent cloning, Cheap entry plan, 22% recurring commission",
    cons: "Character limits add up, Commercial rights need higher tiers",
  },
  {
    slug: "murf-ai",
    name: "Murf AI",
    category: "ai-voice",
    description:
      "Studio AI voiceover platform with a built-in editor, great for presentations, e-learning, and ads.",
    affiliate_url: "https://murf.ai/",
    merchant: "Murf",
    price: "From $29/mo",
    price_amount: 29,
    score: 8.5,
    featured: false,
    cta_text: "Try Murf",
    pros: "All-in-one voice studio, Good for non-technical users, 20% recurring for 24 months",
    cons: "Voices slightly less natural than ElevenLabs, Fewer languages",
  },
  // AI SEO & Marketing
  {
    slug: "semrush",
    name: "Semrush",
    category: "ai-seo",
    description:
      "All-in-one SEO and marketing toolkit for keyword research, competitor analysis, and content.",
    affiliate_url: "https://www.semrush.com/",
    merchant: "Semrush",
    price: "From $139/mo",
    price_amount: 139,
    score: 9.1,
    featured: true,
    cta_text: "Try Semrush",
    pros: "Deep all-in-one toolkit, Best-in-class data, High-ticket $200/sale affiliate program",
    cons: "Expensive for solo users, Steep learning curve",
  },
  {
    slug: "surfer-seo",
    name: "Surfer SEO",
    category: "ai-seo",
    description:
      "AI content optimization tool that scores and guides your writing to rank for target keywords.",
    affiliate_url: "https://surferseo.com/",
    merchant: "Surfer",
    price: "From $99/mo",
    price_amount: 99,
    score: 8.9,
    featured: true,
    cta_text: "Try Surfer SEO",
    pros: "Actionable on-page optimization, Pairs well with AI writers, Generous CPA + recurring options",
    cons: "Not a full SEO suite, Limited keyword research depth",
  },
];

// ── Content (reviews / comparisons / guides) ──────────────────────────────
interface ContentSeed {
  slug: string;
  title: string;
  type: "review" | "comparison" | "guide";
  excerpt: string;
  meta_title: string;
  meta_description: string;
  tags: string[];
  category: string; // category slug
  body: string;
  links: { product: string; role: "hero" | "featured" | "related" | "vs-left" | "vs-right" }[];
}

const AUTHOR = "AI Compared Editorial";

const content: ContentSeed[] = [
  // ── Reviews ──
  {
    slug: "jasper-ai-review",
    title: "Jasper AI Review: Is It Worth It in 2026?",
    type: "review",
    category: "ai-writing",
    excerpt:
      "Hands-on review of Jasper AI — brand voice, templates, pricing, and who it's actually for.",
    meta_title: "Jasper AI Review 2026: Features, Pricing & Verdict",
    meta_description:
      "Our hands-on Jasper AI review covers brand voice, templates, pricing, pros and cons, and whether it's worth it for marketing teams.",
    tags: ["jasper", "ai-writing", "review"],
    body: `<h2>What is Jasper AI?</h2>
<p>Jasper is an AI writing and marketing platform built for teams that care about staying on-brand. It pairs a capable long-form writer with brand-voice controls, a large template library, and collaboration features that suit marketing departments and agencies.</p>
<h2>Where Jasper stands out</h2>
<p>Brand voice is Jasper's headline feature: you train it on your tone once and it applies consistently across blog posts, ads, and emails. The template library covers most marketing formats, and the campaign tools help you go from a brief to a full set of assets quickly.</p>
<h3>Pricing</h3>
<p>Jasper starts around $49/month on the Creator plan (check the latest pricing, as plans change). That's higher than budget rivals, which is the main trade-off for solo users.</p>
<h2>Our verdict — AI Value Score 8.7/10</h2>
<p>If you run marketing for a brand or agency, Jasper's consistency and workflow tooling justify the price. Solo creators on a budget should also look at Writesonic.</p>`,
    links: [{ product: "jasper-ai", role: "hero" }],
  },
  {
    slug: "writesonic-review",
    title: "Writesonic Review: The Best-Value AI Writer?",
    type: "review",
    category: "ai-writing",
    excerpt:
      "Writesonic packs SEO article writing and a free tier into one of the cheapest AI writers.",
    meta_title: "Writesonic Review 2026: Features, Pricing & Verdict",
    meta_description:
      "Writesonic review covering SEO article generation, pricing, the free tier, pros and cons, and how it compares to Jasper.",
    tags: ["writesonic", "ai-writing", "review"],
    body: `<h2>What is Writesonic?</h2>
<p>Writesonic is an affordable AI writing platform with a focus on SEO-optimized articles, chat, and a usable free tier. It's a popular starting point for solo creators and small teams who want output volume without a big monthly bill.</p>
<h2>Where Writesonic stands out</h2>
<p>Value is the story here. The article workflows are aimed at ranking content, and the free tier lets you test before paying. It won't match Jasper on brand-voice nuance, but for the price the output is strong with light editing.</p>
<h3>Pricing</h3>
<p>Paid plans start around $20/month (verify current pricing). A free tier is available to start.</p>
<h2>Our verdict — AI Value Score 8.4/10</h2>
<p>The best-value pick for solo creators and budget-conscious teams. Power users who need tight brand control may prefer Jasper.</p>`,
    links: [{ product: "writesonic", role: "hero" }],
  },
  {
    slug: "heygen-review",
    title: "HeyGen Review: Realistic AI Avatar Videos",
    type: "review",
    category: "ai-video",
    excerpt: "HeyGen turns a script into a realistic talking-head video in minutes. We tested it.",
    meta_title: "HeyGen Review 2026: Features, Pricing & Verdict",
    meta_description:
      "HeyGen review covering avatar realism, voice cloning, rendering speed, pricing, pros and cons, and who it's best for.",
    tags: ["heygen", "ai-video", "review"],
    body: `<h2>What is HeyGen?</h2>
<p>HeyGen is an AI avatar video platform that turns text scripts into talking-head videos with realistic digital presenters, voice cloning, and multi-language support. It's a favorite for marketing clips, faceless channels, and quick explainer videos.</p>
<h2>Where HeyGen stands out</h2>
<p>Avatar realism and rendering speed are excellent, and the voice cloning is convincing. Creating a video is genuinely fast — paste a script, pick an avatar and voice, and export.</p>
<h3>Pricing</h3>
<p>Plans start around $29/month (check the latest). Heavy users should watch credit limits, and custom avatars cost extra.</p>
<h2>Our verdict — AI Value Score 9.0/10</h2>
<p>The best all-round AI avatar tool for creators and marketers. For corporate L&D at scale, also compare Synthesia.</p>`,
    links: [{ product: "heygen", role: "hero" }],
  },
  {
    slug: "synthesia-review",
    title: "Synthesia Review: Best AI Video for Teams?",
    type: "review",
    category: "ai-video",
    excerpt: "Synthesia is the enterprise AI video standard for training and explainer content.",
    meta_title: "Synthesia Review 2026: Features, Pricing & Verdict",
    meta_description:
      "Synthesia review covering avatars, language support, output quality, pricing, pros and cons, and how it compares to HeyGen.",
    tags: ["synthesia", "ai-video", "review"],
    body: `<h2>What is Synthesia?</h2>
<p>Synthesia is an enterprise AI video generator built for training, onboarding, and explainer content. With 230+ avatars and support for 140+ languages, it's a go-to for L&D and corporate communications teams.</p>
<h2>Where Synthesia stands out</h2>
<p>Reliability and polish. Synthesia's output is consistent and professional, and its localization options are unmatched for global teams. It's less playful than HeyGen but more buttoned-up for business use.</p>
<h3>Pricing</h3>
<p>Plans start around $29/month (verify current pricing).</p>
<h2>Our verdict — AI Value Score 8.8/10</h2>
<p>The safest choice for corporate and training video at scale. Individual creators may find HeyGen more flexible.</p>`,
    links: [{ product: "synthesia", role: "hero" }],
  },
  {
    slug: "elevenlabs-review",
    title: "ElevenLabs Review: The Best AI Voice Generator",
    type: "review",
    category: "ai-voice",
    excerpt: "ElevenLabs sets the bar for natural AI voices and cloning. Here's our hands-on take.",
    meta_title: "ElevenLabs Review 2026: Features, Pricing & Verdict",
    meta_description:
      "ElevenLabs review covering voice quality, cloning, language support, pricing, pros and cons, and who it's best for.",
    tags: ["elevenlabs", "ai-voice", "review"],
    body: `<h2>What is ElevenLabs?</h2>
<p>ElevenLabs is the leading AI voice platform, known for the most natural-sounding text-to-speech and voice cloning available. It powers voiceovers, narration, dubbing, and apps across dozens of languages.</p>
<h2>Where ElevenLabs stands out</h2>
<p>Voice naturalness and emotional prosody are clearly ahead of rivals, and the cloning quality is remarkable. The entry plan is cheap, making it easy to test.</p>
<h3>Pricing</h3>
<p>Plans start around $5/month (check the latest). Watch character limits, and note that full commercial rights come on higher tiers.</p>
<h2>Our verdict — AI Value Score 9.2/10</h2>
<p>The best AI voice tool for almost everyone. If you want an all-in-one studio editor instead, compare Murf.</p>`,
    links: [{ product: "elevenlabs", role: "hero" }],
  },
  {
    slug: "murf-ai-review",
    title: "Murf AI Review: Studio Voiceovers Without a Mic",
    type: "review",
    category: "ai-voice",
    excerpt: "Murf is an all-in-one AI voiceover studio aimed at non-technical creators and teams.",
    meta_title: "Murf AI Review 2026: Features, Pricing & Verdict",
    meta_description:
      "Murf AI review covering voice quality, the built-in editor, pricing, pros and cons, and how it compares to ElevenLabs.",
    tags: ["murf", "ai-voice", "review"],
    body: `<h2>What is Murf AI?</h2>
<p>Murf is an AI voiceover platform with a built-in studio editor designed for presentations, e-learning, and ads. It's aimed at non-technical users who want to produce polished voiceovers without recording gear.</p>
<h2>Where Murf stands out</h2>
<p>The all-in-one editor — sync voice to slides and media, adjust pacing and emphasis, and export — makes it approachable. Its affiliate program is also notable for paying recurring commission for 24 months.</p>
<h3>Pricing</h3>
<p>Plans start around $29/month (verify current pricing).</p>
<h2>Our verdict — AI Value Score 8.5/10</h2>
<p>A great choice for teams that want a guided voiceover studio. For the most natural raw voices, ElevenLabs still leads.</p>`,
    links: [{ product: "murf-ai", role: "hero" }],
  },
  {
    slug: "semrush-review",
    title: "Semrush Review: Still the SEO Standard?",
    type: "review",
    category: "ai-seo",
    excerpt: "Semrush is the all-in-one SEO and marketing toolkit. We break down value and fit.",
    meta_title: "Semrush Review 2026: Features, Pricing & Verdict",
    meta_description:
      "Semrush review covering keyword research, competitor analysis, content tools, pricing, pros and cons, and who it's best for.",
    tags: ["semrush", "ai-seo", "review"],
    body: `<h2>What is Semrush?</h2>
<p>Semrush is an all-in-one SEO and digital marketing platform covering keyword research, competitor analysis, site audits, content, and advertising data. It's the toolkit many agencies build their workflow around.</p>
<h2>Where Semrush stands out</h2>
<p>Data depth and breadth. Few tools match the scope — from organic and paid research to backlink analysis and content optimization. Its affiliate program is also one of the most lucrative in the niche.</p>
<h3>Pricing</h3>
<p>Plans start around $139/month (verify current pricing). It's an investment, best justified for serious marketers and agencies.</p>
<h2>Our verdict — AI Value Score 9.1/10</h2>
<p>The most complete SEO toolkit available. If you only need on-page content optimization, Surfer SEO is a cheaper, focused alternative.</p>`,
    links: [{ product: "semrush", role: "hero" }],
  },
  {
    slug: "surfer-seo-review",
    title: "Surfer SEO Review: AI Content Optimization That Works",
    type: "review",
    category: "ai-seo",
    excerpt: "Surfer SEO scores your content against the SERP and tells you how to rank. Worth it?",
    meta_title: "Surfer SEO Review 2026: Features, Pricing & Verdict",
    meta_description:
      "Surfer SEO review covering content optimization, the Content Editor, pricing, pros and cons, and how it compares to Semrush.",
    tags: ["surfer-seo", "ai-seo", "review"],
    body: `<h2>What is Surfer SEO?</h2>
<p>Surfer SEO is an AI content optimization tool that analyzes the top-ranking pages for your keyword and gives you a data-driven score plus concrete guidance — terms to include, length, headings — to help your content rank.</p>
<h2>Where Surfer stands out</h2>
<p>Actionability. The Content Editor turns SEO into a checklist, and it pairs beautifully with an AI writer like Jasper for a draft-then-optimize workflow. It's not a full SEO suite, but it nails on-page optimization.</p>
<h3>Pricing</h3>
<p>Plans start around $99/month (check the latest).</p>
<h2>Our verdict — AI Value Score 8.9/10</h2>
<p>The best focused on-page optimization tool. If you need full keyword research and competitor data too, pair it with — or step up to — Semrush.</p>`,
    links: [{ product: "surfer-seo", role: "hero" }],
  },

  // ── Comparisons ──
  {
    slug: "jasper-vs-writesonic",
    title: "Jasper vs Writesonic: Which AI Writer Wins in 2026?",
    type: "comparison",
    category: "ai-writing",
    excerpt:
      "Premium brand-voice power vs best-in-class value. We compare Jasper and Writesonic head to head.",
    meta_title: "Jasper vs Writesonic (2026): Which AI Writer Is Better?",
    meta_description:
      "Jasper vs Writesonic compared on output quality, brand voice, SEO, pricing, and value. See which AI writing tool wins for your use case.",
    tags: ["jasper", "writesonic", "ai-writing", "comparison"],
    body: `<h2>Jasper vs Writesonic at a glance</h2>
<p>Both are excellent AI writers, but they serve different buyers. Jasper is the premium, brand-first choice for marketing teams; Writesonic is the value pick for solo creators who want volume.</p>
<h2>Output quality &amp; brand voice</h2>
<p>Jasper wins on long-form consistency and brand-voice control. Writesonic is very capable and improving fast, especially for SEO articles, but needs slightly more editing on long pieces.</p>
<h2>Pricing &amp; value</h2>
<p>Writesonic is significantly cheaper (from ~$20/mo with a free tier) versus Jasper (from ~$49/mo). For tight budgets, Writesonic is the obvious start.</p>
<h2>The verdict</h2>
<p>Choose <strong>Jasper</strong> if you run brand or agency marketing and need consistency at scale. Choose <strong>Writesonic</strong> if you're a solo creator or small team optimizing for value.</p>`,
    links: [
      { product: "jasper-ai", role: "vs-left" },
      { product: "writesonic", role: "vs-right" },
    ],
  },
  {
    slug: "heygen-vs-synthesia",
    title: "HeyGen vs Synthesia: Best AI Video Generator?",
    type: "comparison",
    category: "ai-video",
    excerpt: "Creator-friendly flexibility vs enterprise polish. HeyGen and Synthesia compared.",
    meta_title: "HeyGen vs Synthesia (2026): Which AI Video Tool Wins?",
    meta_description:
      "HeyGen vs Synthesia compared on avatar realism, languages, ease of use, pricing, and value. Find the best AI video generator for you.",
    tags: ["heygen", "synthesia", "ai-video", "comparison"],
    body: `<h2>HeyGen vs Synthesia at a glance</h2>
<p>Both turn scripts into avatar videos, but the fit differs. HeyGen is more flexible and creator-friendly; Synthesia is more polished for corporate training and global teams.</p>
<h2>Avatars &amp; realism</h2>
<p>HeyGen's avatars and voice cloning feel slightly more dynamic and modern. Synthesia's are highly professional and consistent — ideal for L&D and onboarding.</p>
<h2>Languages &amp; localization</h2>
<p>Synthesia leads on sheer language coverage (140+), which matters for global enterprises. HeyGen covers the major languages well for most creators.</p>
<h2>The verdict</h2>
<p>Choose <strong>HeyGen</strong> for marketing clips, faceless channels, and flexible creator use. Choose <strong>Synthesia</strong> for corporate training and localized content at scale.</p>`,
    links: [
      { product: "heygen", role: "vs-left" },
      { product: "synthesia", role: "vs-right" },
    ],
  },
  {
    slug: "elevenlabs-vs-murf",
    title: "ElevenLabs vs Murf: Which AI Voice Tool Is Better?",
    type: "comparison",
    category: "ai-voice",
    excerpt: "The most natural voices vs an all-in-one studio. ElevenLabs and Murf compared.",
    meta_title: "ElevenLabs vs Murf (2026): Best AI Voice Generator?",
    meta_description:
      "ElevenLabs vs Murf compared on voice naturalness, cloning, editor, languages, and pricing. See which AI voice tool fits your workflow.",
    tags: ["elevenlabs", "murf", "ai-voice", "comparison"],
    body: `<h2>ElevenLabs vs Murf at a glance</h2>
<p>ElevenLabs wins on raw voice quality and cloning; Murf wins on being an approachable all-in-one voiceover studio for non-technical users.</p>
<h2>Voice quality &amp; cloning</h2>
<p>ElevenLabs is the clear leader for natural prosody and realistic cloning. Murf's voices are good and consistent, just a notch less lifelike.</p>
<h2>Workflow</h2>
<p>Murf's built-in editor (sync voice to slides/media, adjust pacing) is great for presentations and e-learning. ElevenLabs is more of a best-in-class voice engine you drop into your own workflow.</p>
<h2>The verdict</h2>
<p>Choose <strong>ElevenLabs</strong> for the most natural voices and cloning. Choose <strong>Murf</strong> if you want a guided studio for presentations and training content.</p>`,
    links: [
      { product: "elevenlabs", role: "vs-left" },
      { product: "murf-ai", role: "vs-right" },
    ],
  },
  {
    slug: "semrush-vs-surfer-seo",
    title: "Semrush vs Surfer SEO: Which Do You Actually Need?",
    type: "comparison",
    category: "ai-seo",
    excerpt: "A full SEO suite vs focused on-page optimization. Semrush and Surfer SEO compared.",
    meta_title: "Semrush vs Surfer SEO (2026): Which Should You Buy?",
    meta_description:
      "Semrush vs Surfer SEO compared on scope, on-page optimization, keyword research, pricing, and value. See which SEO tool you actually need.",
    tags: ["semrush", "surfer-seo", "ai-seo", "comparison"],
    body: `<h2>Semrush vs Surfer SEO at a glance</h2>
<p>These aren't really rivals so much as different jobs. Semrush is a complete SEO and marketing suite; Surfer is a focused on-page content optimizer. Many pros use both.</p>
<h2>Scope</h2>
<p>Semrush does keyword research, competitor analysis, backlinks, audits, and ads. Surfer concentrates on making a single piece of content rank as well as possible.</p>
<h2>Pricing &amp; value</h2>
<p>Surfer (from ~$99/mo) is cheaper and laser-focused; Semrush (from ~$139/mo) costs more but replaces several tools.</p>
<h2>The verdict</h2>
<p>Choose <strong>Surfer SEO</strong> if you mainly write and optimize content. Choose <strong>Semrush</strong> if you need the full research-and-strategy toolkit — or use Surfer for writing and Semrush for research.</p>`,
    links: [
      { product: "semrush", role: "vs-left" },
      { product: "surfer-seo", role: "vs-right" },
    ],
  },

  // ── Guides ──
  {
    slug: "best-ai-writing-tools",
    title: "Best AI Writing Tools in 2026 (Ranked &amp; Scored)",
    type: "guide",
    category: "ai-writing",
    excerpt: "Our ranked pick of the best AI writing tools, each scored with the AI Value Score.",
    meta_title: "9 Best AI Writing Tools in 2026 (Ranked &amp; Tested)",
    meta_description:
      "The best AI writing tools in 2026, ranked and scored. Compare Jasper, Writesonic, and Copy.ai on quality, features, and value.",
    tags: ["ai-writing", "guide", "best-of"],
    body: `<h2>The best AI writing tools, ranked</h2>
<p>We scored the leading AI writers on output quality, ease of use, value, and features using our 0–10 AI Value Score. Here are the top picks for content and marketing teams.</p>
<h3>1. Jasper — best for brands &amp; agencies (8.7)</h3>
<p>The most polished brand-voice and team workflow tooling. Worth the premium if consistency matters.</p>
<h3>2. Writesonic — best value (8.4)</h3>
<p>SEO-friendly articles and a free tier at a fraction of the price. The best place to start for solo creators.</p>
<h3>3. Copy.ai — best for short-form &amp; sales copy (8.1)</h3>
<p>Excellent for go-to-market and short-form copy with handy workflow automations.</p>
<h2>How to choose</h2>
<p>Pick Jasper for brand-critical marketing, Writesonic for value, and Copy.ai for sales/short-form. All three offer trials or free tiers — test before committing.</p>`,
    links: [
      { product: "jasper-ai", role: "related" },
      { product: "writesonic", role: "related" },
      { product: "copy-ai", role: "related" },
    ],
  },
  {
    slug: "best-ai-video-generators",
    title: "Best AI Video Generators in 2026 (Ranked &amp; Scored)",
    type: "guide",
    category: "ai-video",
    excerpt: "The best AI video and avatar generators, scored and compared for creators and teams.",
    meta_title: "Best AI Video Generators in 2026 (Ranked &amp; Tested)",
    meta_description:
      "The best AI video generators in 2026, ranked and scored. Compare HeyGen and Synthesia on realism, languages, and value.",
    tags: ["ai-video", "guide", "best-of"],
    body: `<h2>The best AI video generators, ranked</h2>
<p>We scored the top AI avatar video tools on realism, ease of use, languages, and value. Here are the picks worth your money.</p>
<h3>1. HeyGen — best all-round (9.0)</h3>
<p>Realistic avatars, fast rendering, and voice cloning make it the best choice for most creators and marketers.</p>
<h3>2. Synthesia — best for teams &amp; training (8.8)</h3>
<p>The enterprise standard for L&D and localized content, with unmatched language support.</p>
<h2>How to choose</h2>
<p>Pick HeyGen for marketing and creator content, Synthesia for corporate training at scale. Both offer paid entry plans — start small and scale credits as needed.</p>`,
    links: [
      { product: "heygen", role: "related" },
      { product: "synthesia", role: "related" },
    ],
  },
  {
    slug: "best-ai-voice-generators",
    title: "Best AI Voice Generators in 2026 (Ranked &amp; Scored)",
    type: "guide",
    category: "ai-voice",
    excerpt:
      "The best AI voice and text-to-speech tools, scored for naturalness, cloning, and value.",
    meta_title: "Best AI Voice Generators in 2026 (Ranked &amp; Tested)",
    meta_description:
      "The best AI voice generators in 2026, ranked and scored. Compare ElevenLabs and Murf on voice quality, cloning, and value.",
    tags: ["ai-voice", "guide", "best-of"],
    body: `<h2>The best AI voice generators, ranked</h2>
<p>We scored the leading AI voice tools on naturalness, cloning, workflow, and value. Here's where to put your money.</p>
<h3>1. ElevenLabs — best overall (9.2)</h3>
<p>The most natural voices and best cloning, with a cheap entry plan. The default choice for most use cases.</p>
<h3>2. Murf — best all-in-one studio (8.5)</h3>
<p>A guided voiceover studio that's ideal for presentations, e-learning, and ads.</p>
<h2>How to choose</h2>
<p>Pick ElevenLabs for the most natural voices and cloning; pick Murf if you want an editor that syncs voice to your slides and media.</p>`,
    links: [
      { product: "elevenlabs", role: "related" },
      { product: "murf-ai", role: "related" },
    ],
  },
  {
    slug: "best-ai-seo-tools",
    title: "Best AI SEO Tools in 2026 (Ranked &amp; Scored)",
    type: "guide",
    category: "ai-seo",
    excerpt: "The best AI-powered SEO tools, scored for research depth, optimization, and value.",
    meta_title: "Best AI SEO Tools in 2026 (Ranked &amp; Tested)",
    meta_description:
      "The best AI SEO tools in 2026, ranked and scored. Compare Semrush and Surfer SEO on scope, optimization, and value.",
    tags: ["ai-seo", "guide", "best-of"],
    body: `<h2>The best AI SEO tools, ranked</h2>
<p>We scored the top AI-powered SEO platforms on data depth, optimization guidance, and value. Here are the tools that move rankings.</p>
<h3>1. Semrush — best all-in-one suite (9.1)</h3>
<p>The most complete toolkit for research, competitor analysis, and content — the backbone of many agency workflows.</p>
<h3>2. Surfer SEO — best on-page optimizer (8.9)</h3>
<p>Turns ranking into a checklist and pairs perfectly with an AI writer for a draft-then-optimize flow.</p>
<h2>How to choose</h2>
<p>Use Surfer if you mostly write and optimize content; step up to Semrush when you need full keyword research, backlinks, and competitor data.</p>`,
    links: [
      { product: "semrush", role: "related" },
      { product: "surfer-seo", role: "related" },
    ],
  },
];

// ── Seeding logic ──────────────────────────────────────────────────────

async function upsertSite(): Promise<string> {
  const { data: existing } = await sb.from("sites").select("id").eq("slug", SITE.slug).single();
  if (existing) {
    console.log(`  Site "${SITE.slug}" already exists (${existing.id})`);
    return existing.id;
  }
  const { data, error } = await sb
    .from("sites")
    .insert({
      slug: SITE.slug,
      name: SITE.name,
      domain: SITE.domain,
      language: SITE.language,
      direction: SITE.direction,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create site: ${error.message}`);
  console.log(`  Created site "${SITE.slug}" (${data.id})`);
  return data.id;
}

async function seedCategories(siteId: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const cat of categories) {
    const { data: existing } = await sb
      .from("categories")
      .select("id")
      .eq("site_id", siteId)
      .eq("slug", cat.slug)
      .single();
    if (existing) {
      ids.set(cat.slug, existing.id);
      continue;
    }
    const { data, error } = await sb
      .from("categories")
      .insert({ site_id: siteId, ...cat })
      .select("id")
      .single();
    if (error) {
      console.error(`  Failed to seed category "${cat.slug}":`, error.message);
      continue;
    }
    ids.set(cat.slug, data.id);
  }
  console.log(`  Seeded ${ids.size} categories`);
  return ids;
}

async function seedProducts(
  siteId: string,
  categoryIds: Map<string, string>,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const prod of products) {
    const { data: existing } = await sb
      .from("products")
      .select("id")
      .eq("site_id", siteId)
      .eq("slug", prod.slug)
      .single();
    if (existing) {
      ids.set(prod.slug, existing.id);
      continue;
    }
    const { category, ...rest } = prod;
    const { data, error } = await sb
      .from("products")
      .insert({
        site_id: siteId,
        category_id: categoryIds.get(category) ?? null,
        image_url: "",
        image_alt: prod.name,
        price_currency: "USD",
        deal_text: "",
        status: "active",
        ...rest,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`  Failed to seed product "${prod.slug}":`, error.message);
      continue;
    }
    ids.set(prod.slug, data.id);
  }
  console.log(`  Seeded ${ids.size} products`);
  return ids;
}

async function seedContent(
  siteId: string,
  categoryIds: Map<string, string>,
  productIds: Map<string, string>,
) {
  let count = 0;
  for (const item of content) {
    let contentId: string;
    const { data: existing } = await sb
      .from("content")
      .select("id")
      .eq("site_id", siteId)
      .eq("slug", item.slug)
      .single();

    if (existing) {
      contentId = existing.id;
    } else {
      const { links, category, ...rest } = item;
      const { data, error } = await sb
        .from("content")
        .insert({
          site_id: siteId,
          category_id: categoryIds.get(category) ?? null,
          status: "published",
          featured_image: "",
          author: AUTHOR,
          ...rest,
        })
        .select("id")
        .single();
      if (error) {
        console.error(`  Failed to seed content "${item.slug}":`, error.message);
        continue;
      }
      contentId = data.id;
      count++;
    }

    // Link products (idempotent: ignore duplicates on the composite PK)
    for (const link of item.links) {
      const productId = productIds.get(link.product);
      if (!productId) continue;
      const { error } = await sb
        .from("content_products")
        .upsert(
          { content_id: contentId, product_id: productId, role: link.role },
          { onConflict: "content_id,product_id" },
        );
      if (error) {
        console.error(`  Failed to link "${link.product}" to "${item.slug}":`, error.message);
      }
    }
  }
  console.log(`  Seeded ${count} new content items (+ product links)`);
}

async function main() {
  console.log(`Seeding "${SITE.name}" (${SITE.domain})...\n`);

  console.log("1. Upserting site...");
  const siteId = await upsertSite();

  console.log("\n2. Seeding categories...");
  const categoryIds = await seedCategories(siteId);

  console.log("\n3. Seeding products...");
  const productIds = await seedProducts(siteId, categoryIds);

  console.log("\n4. Seeding content + product links...");
  await seedContent(siteId, categoryIds, productIds);

  console.log("\nDone! AI Compared site seeded successfully.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
