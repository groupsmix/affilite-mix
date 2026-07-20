/**
 * Static guide content for the CompareAI Etsy AI/POD niche tenant.
 *
 * These pages are authored manually and cite official Etsy sources. They are not
 * thin AI-generated pages; each one includes original workflow steps, a
 * checklist, an original calculation or calculator link, and an FAQ section.
 */

export interface EtsyGuide {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  datePublished: string;
  dateModified: string;
  bodyHtml: string;
  primaryKeyword: string;
  excerpt: string;
  tags: string[];
  relatedSlugs: string[];
}

const guides: Record<string, EtsyGuide> = {
  "best-etsy-product-research-workflow-for-pod": {
    slug: "best-etsy-product-research-workflow-for-pod",
    title: "Best Etsy Product Research Workflow for Print-on-Demand (2026)",
    metaTitle: "Best Etsy Product Research Workflow for Print-on-Demand (2026)",
    metaDescription:
      "A repeatable product-research workflow for Etsy POD sellers. Find proven niches, validate demand, and estimate profit before you design.",
    datePublished: "2026-07-18",
    dateModified: "2026-07-18",
    primaryKeyword: "etsy product research workflow",
    excerpt:
      "A repeatable product-research workflow for Etsy POD sellers. Find proven niches, validate demand, and estimate profit before you design.",
    tags: ["Etsy research", "POD niches", "product research workflow"],
    relatedSlugs: ["find-low-competition-etsy-opportunities", "complete-pod-workflow"],
    bodyHtml: `
      <h2>A repeatable 4-step research workflow</h2>
      <ol>
        <li><strong>Pick a niche you understand.</strong> Start with interests or audiences you can serve (dog lovers, teachers, gamers, wedding planners). Avoid chasing random trends.</li>
        <li><strong>Find proven listings.</strong> Search Etsy for keyword phrases in your niche. Look for listings with review counts and recent sales activity.</li>
        <li><strong>Validate demand and competition.</strong> Check if the design solves a specific problem, targets a specific occasion, or has a unique angle.</li>
        <li><strong>Estimate profit before designing.</strong> Use the <a href="/tools/etsy-profit-calculator">Etsy profit calculator</a> with your expected price, POD production cost, and Etsy fees.</li>
      </ol>
      <h2>What to look for in a winning listing</h2>
      <ul>
        <li>Clear, specific keyword phrase in the title</li>
        <li>Recent reviews (activity in the last 30-60 days)</li>
        <li>Simple design that could be recreated or improved</li>
        <li>Room to differentiate (better mockup, title, gift angle)</li>
      </ul>
      <h2>Red flags to skip</h2>
      <ul>
        <li>Trademarked phrases, characters, or brand names</li>
        <li>Seasonal spikes without year-round demand</li>
        <li>Listings with hundreds of nearly identical competitors and no unique angle</li>
      </ul>
      <h2>FAQ</h2>
      <h3>How long should product research take?</h3>
      <p>One focused 60-90 minute session per niche is enough to shortlist 3-5 product ideas worth testing.</p>
      <h3>Do I need a paid research tool?</h3>
      <p>Not at first. You can validate demand manually. Paid tools become useful once you scale beyond a few listings per week.</p>
      <h3>What is the best niche for POD on Etsy?</h3>
      <p>There is no single best niche. The best niche is one with buyer intent, low trademark risk, and designs you can improve.</p>
    `,
  },
  "etsy-ai-disclosure-rules": {
    slug: "etsy-ai-disclosure-rules",
    title: "Etsy AI Disclosure Rules: What Sellers Must Know (Official Policy)",
    metaTitle: "Etsy AI Disclosure Rules: What Sellers Must Know (2026)",
    metaDescription:
      "Plain-language summary of Etsy's AI disclosure and creativity policies for sellers. Cites official Etsy sources and explains where to put the disclosure.",
    datePublished: "2026-07-18",
    dateModified: "2026-07-18",
    primaryKeyword: "etsy ai disclosure",
    excerpt:
      "Plain-language summary of Etsy's AI disclosure and creativity policies for sellers. Cites official Etsy sources and explains where to put the disclosure.",
    tags: ["Etsy AI disclosure", "AI policy", "Etsy seller compliance"],
    relatedSlugs: [
      "compliant-etsy-ai-mockups",
      "complete-digital-product-workflow",
      "complete-pod-workflow",
    ],
    bodyHtml: `
      <h2>When must you disclose AI use on Etsy?</h2>
      <p>Etsy's Seller Policy states that if an item is created through the use of artificial intelligence, you must disclose this in your relevant listings. Source: <a href="https://www.etsy.com/legal/policy/seller-policy-effective-through-july-8/1489086421092" target="_blank" rel="noopener noreferrer">Etsy Seller Policy</a>.</p>
      <p>Etsy's Creativity Standards also require disclosure for "seller-prompted AI creations" such as fantasy scenes or custom portraits generated from your prompts. Source: <a href="https://www.etsy.com/legal/creativity/" target="_blank" rel="noopener noreferrer">Etsy Creativity Standards</a>.</p>
      <h2>Where do you put the disclosure?</h2>
      <p>Add a clear statement in the item description. Example: "This design was created with AI assistance based on my original prompt." Do not hide it behind vague language.</p>
      <h2>What counts as AI-generated?</h2>
      <ul>
        <li>Images created by DALL-E, Midjourney, Stable Diffusion, or similar tools from your prompts</li>
        <li>Designs generated by Kittl, Canva Magic Media, or other AI features</li>
        <li>Custom portraits or scenes generated using AI tools</li>
      </ul>
      <h2>AI disclosure checklist</h2>
      <ul>
        <li>Did I use an AI tool to generate any part of this design?</li>
        <li>Is the disclosure visible in the listing description?</li>
        <li>Can I prove or explain my creative input?</li>
        <li>Does the listing still meet Etsy's "designed by you" requirement?</li>
      </ul>
      <h2>FAQ</h2>
      <h3>Can I sell AI art on Etsy?</h3>
      <p>Yes, but only if you disclose the use of AI and the listing otherwise meets Etsy's policies. Etsy allows seller-prompted AI creations that are designed by you.</p>
      <h3>What happens if I do not disclose AI use?</h3>
      <p>Etsy may remove listings, suspend accounts, or take other enforcement actions for policy violations.</p>
      <h3>Does AI disclosure hurt sales?</h3>
      <p>There is no public data proving that. Clear disclosure builds trust and protects your shop from policy strikes.</p>
    `,
  },
  "compliant-etsy-ai-mockups": {
    slug: "compliant-etsy-ai-mockups",
    title: "Creating Compliant Etsy Mockups with AI",
    metaTitle: "Creating Compliant Etsy Mockups with AI (2026 Guide)",
    metaDescription:
      "How to make Etsy mockups with AI tools without breaking Etsy's AI disclosure, production partner, or creativity policies.",
    datePublished: "2026-07-18",
    dateModified: "2026-07-18",
    primaryKeyword: "etsy ai mockup disclosure",
    excerpt:
      "How to make Etsy mockups with AI tools without breaking Etsy's AI disclosure, production partner, or creativity policies.",
    tags: ["Etsy mockups", "AI mockups", "POD mockups"],
    relatedSlugs: ["etsy-ai-disclosure-rules", "complete-pod-workflow"],
    bodyHtml: `
      <h2>AI mockups and Etsy's rules</h2>
      <p>AI-generated mockups are allowed when you are transparent and the final product matches what the buyer receives. If you use a production partner for print-on-demand, you must disclose that partner in the listing. Source: <a href="https://help.etsy.com/hc/en-gb/articles/360024112614-What-Can-I-Sell-on-Etsy" target="_blank" rel="noopener noreferrer">What Can I Sell on Etsy?</a></p>
      <h2>Best practices for AI mockups</h2>
      <ul>
        <li>Use your own product photos as the base when possible</li>
        <li>Label AI-generated scenes or models clearly in the description</li>
        <li>Show the actual printed product or a realistic mockup, not a misleading fantasy render</li>
        <li>Disclose your print-on-demand production partner</li>
      </ul>
      <h2>Common mistakes to avoid</h2>
      <ul>
        <li>Mockups that look nothing like the shipped product</li>
        <li>Using AI-generated people or faces without disclosure</li>
        <li>Hiding the production partner or AI process</li>
      </ul>
      <h2>FAQ</h2>
      <h3>Do I need to disclose AI mockups?</h3>
      <p>If the mockup image itself was generated or substantially altered by AI, disclose it in the listing description.</p>
      <h3>Can I use AI to generate model photos?</h3>
      <p>Yes, but you must disclose AI use and ensure the final garment or product representation is accurate.</p>
      <h3>What is a production partner?</h3>
      <p>A production partner is a third party that helps produce your items. Etsy requires disclosure in relevant listings.</p>
    `,
  },
  "optimize-etsy-titles-tags-with-data-and-ai": {
    slug: "optimize-etsy-titles-tags-with-data-and-ai",
    title: "How to Optimize Etsy Titles and Tags with Data + AI",
    metaTitle: "How to Optimize Etsy Titles and Tags with Data + AI (2026)",
    metaDescription:
      "Practical guide to Etsy title and tag optimization. Use marketplace data, keyword research, and AI suggestions to rank for low-difficulty buyer keywords.",
    datePublished: "2026-07-18",
    dateModified: "2026-07-18",
    primaryKeyword: "etsy seo tools",
    excerpt:
      "Practical guide to Etsy title and tag optimization. Use marketplace data, keyword research, and AI suggestions to rank for low-difficulty buyer keywords.",
    tags: ["Etsy SEO", "titles and tags", "Etsy keywords"],
    relatedSlugs: [
      "find-low-competition-etsy-opportunities",
      "best-etsy-product-research-workflow-for-pod",
    ],
    bodyHtml: `
      <h2>Why titles and tags matter</h2>
      <p>Etsy's search algorithm matches shopper queries to the words in your title and tags. Titles carry more weight, but tags help you cover synonyms and long-tail phrases.</p>
      <h2>Step-by-step optimization workflow</h2>
      <ol>
        <li><strong>Start with a seed keyword.</strong> Use a phrase like "etsy seo tools" or a product phrase like "funny dog mom t-shirt".</li>
        <li><strong>Find related phrases.</strong> Look at Etsy search suggestions, competitor titles, and keyword tools.</li>
        <li><strong>Put the strongest keyword first.</strong> Etsy gives more weight to words at the beginning of the title.</li>
        <li><strong>Use all 13 tags.</strong> Cover synonyms, occasions, and buyer phrases. Avoid repeating the exact same words already in the title.</li>
        <li><strong>Run it through the profit calculator.</strong> Better ranking only matters if the listing is profitable. <a href="/tools/etsy-profit-calculator">Calculate profit per sale</a>.</li>
      </ol>
      <h2>How AI can help (and where it cannot)</h2>
      <p>AI tools can brainstorm title variations and tag ideas. They cannot replace marketplace data. Always cross-check suggestions against actual Etsy search results and search volume estimates.</p>
      <h2>FAQ</h2>
      <h3>How many characters should an Etsy title be?</h3>
      <p>Etsy titles can be up to 140 characters. Use the full space when it adds relevant keywords; otherwise keep it readable.</p>
      <h3>Should I stuff keywords into tags?</h3>
      <p>No. Each tag should be a coherent phrase or keyword. Etsy matches tags as whole phrases, not individual words.</p>
      <h3>How often should I refresh titles and tags?</h3>
      <p>Review underperforming listings every 30-60 days. Do not change titles on listings that are already ranking well for their target keyword.</p>
    `,
  },
  "find-low-competition-etsy-opportunities": {
    slug: "find-low-competition-etsy-opportunities",
    title: "How to Find Low-Competition Etsy Opportunities",
    metaTitle: "How to Find Low-Competition Etsy Opportunities (2026)",
    metaDescription:
      "A methodical way to find underserved Etsy niches and product ideas with less competition and real buyer intent.",
    datePublished: "2026-07-18",
    dateModified: "2026-07-18",
    primaryKeyword: "low competition etsy niches",
    excerpt:
      "A methodical way to find underserved Etsy niches and product ideas with less competition and real buyer intent.",
    tags: ["low competition niches", "Etsy opportunity", "niche research"],
    relatedSlugs: [
      "best-etsy-product-research-workflow-for-pod",
      "optimize-etsy-titles-tags-with-data-and-ai",
    ],
    bodyHtml: `
      <h2>The opportunity score</h2>
      <p>Look for listings that have strong demand signals (recent reviews) but weak listing quality. If a listing ranks well with poor photos or thin titles, there is room for a better listing.</p>
      <h2>Where to look</h2>
      <ul>
        <li>Etsy search suggestions and related searches</li>
        <li>Subreddit communities for your target buyer</li>
        <li>Pinterest trends for visual niches</li>
        <li>Amazon and Google for broader demand signals</li>
      </ul>
      <h2>How to validate</h2>
      <ol>
        <li>Search the keyword on Etsy and count the top 20 listings with 10+ reviews</li>
        <li>Check if the top listings have clear titles, strong mockups, and complete tags</li>
        <li>Look for niches where you can bring a unique angle (gift occasion, personalization, subculture)</li>
        <li>Estimate profit with the <a href="/tools/etsy-profit-calculator">profit calculator</a> before designing</li>
      </ol>
      <h2>FAQ</h2>
      <h3>What is a low-competition keyword?</h3>
      <p>A phrase with buyer intent where the current top listings have low review counts, weak photos, or obvious room for improvement.</p>
      <h3>How do I know if a niche has demand?</h3>
      <p>Recent reviews and active new listings are the strongest free signals. Paid tools can confirm search volume.</p>
      <h3>Should I copy top listings?</h3>
      <p>No. Use them as market validation and then create an original design, title, and angle.</p>
    `,
  },
  "complete-digital-product-workflow": {
    slug: "complete-digital-product-workflow",
    title: "A Complete Digital Product Workflow for Etsy",
    metaTitle: "A Complete Digital Product Workflow for Etsy (2026)",
    metaDescription:
      "End-to-end workflow for creating and listing digital products on Etsy using AI tools and marketplace data.",
    datePublished: "2026-07-18",
    dateModified: "2026-07-18",
    primaryKeyword: "etsy digital product workflow",
    excerpt:
      "End-to-end workflow for creating and listing digital products on Etsy using AI tools and marketplace data.",
    tags: ["digital products", "Etsy workflow", "AI design"],
    relatedSlugs: [
      "etsy-ai-disclosure-rules",
      "optimize-etsy-titles-tags-with-data-and-ai",
      "tools/etsy-profit-calculator",
    ],
    bodyHtml: `
      <h2>Overview</h2>
      <p>This workflow takes you from product idea to published digital listing: Research → Create → Optimize → List.</p>
      <h2>Step 1: Research</h2>
      <p>Find a specific buyer need using Etsy search, competitor reviews, and keyword suggestions. Focus on digital products: planners, templates, SVGs, wall art, invitations.</p>
      <h2>Step 2: Create</h2>
      <p>Design in a tool like Kittl or Canva. Keep source files organized and export in formats buyers can edit (PDF, SVG, PNG, editable Canva links).</p>
      <h2>Step 3: Optimize</h2>
      <p>Write a keyword-rich title, fill all 13 tags, and write a description that explains the product, format, and usage. Include AI disclosure if any part of the design was AI-generated.</p>
      <h2>Step 4: List</h2>
      <p>Create a mockup image, set a price, and upload files. Use the <a href="/tools/etsy-profit-calculator">Etsy profit calculator</a> to confirm your margin after Etsy's listing and transaction fees.</p>
      <h2>FAQ</h2>
      <h3>What digital products sell best on Etsy?</h3>
      <p>Planners, wedding templates, wall art, educational printables, and craft patterns consistently show demand. Validate each idea before investing design time.</p>
      <h3>Do I need to ship digital products?</h3>
      <p>No. Etsy delivers digital files automatically after purchase. You only need to set up the file upload and delivery settings.</p>
      <h3>Can I use AI to make digital products?</h3>
      <p>Yes, as long as you disclose AI use in the listing and the final product meets Etsy's "designed by you" requirement.</p>
    `,
  },
  "everbee-pricing-and-break-even": {
    slug: "everbee-pricing-and-break-even",
    title: "EverBee Pricing & Break-Even Analysis (2026)",
    metaTitle: "EverBee Pricing & Break-Even Analysis for Etsy Sellers (2026)",
    metaDescription:
      "Compare EverBee Hobby, Growth and Business plans, see official pricing, and calculate how many sales you need to break even on the subscription.",
    datePublished: "2026-07-18",
    dateModified: "2026-07-18",
    primaryKeyword: "everbee pricing",
    excerpt:
      "Compare EverBee Hobby, Growth and Business plans, see official pricing, and calculate how many sales you need to break even.",
    tags: ["EverBee", "EverBee pricing", "Etsy tools"],
    relatedSlugs: [
      "is-everbee-worth-it-for-new-shop",
      "alura-vs-everbee",
      "tools/etsy-profit-calculator",
    ],
    bodyHtml: `
      <h2>EverBee pricing at a glance</h2>
      <p>EverBee offers three plans for Etsy research and analytics. Prices below are from the official EverBee pricing page and are shown as monthly/annual billing.</p>
      <ul>
        <li><strong>Hobby:</strong> $0 forever — limited analytics, 10 keyword lookups, tag analyzer.</li>
        <li><strong>Growth:</strong> $29.99/mo or $19.99/mo billed annually ($239/yr) — unlimited keywords, trends, favorites and priority support.</li>
        <li><strong>Business:</strong> $99/mo or $69/mo billed annually ($828/yr) — unlimited everything and advanced filters.</li>
      </ul>
      <h2>Which plan should you choose?</h2>
      <p>Start with Hobby while you are testing ideas and learning how to read the data. Move to Growth when you are listing regularly and need unlimited keyword research. Business is for high-volume sellers or teams managing multiple shops.</p>
      <h2>Break-even math for EverBee Growth</h2>
      <p>At the annual Growth price of $19.99/mo, you need one extra sale per month worth more than $20 in profit to pay for the tool. For a $22 POD t-shirt with $8 production cost and ~15% Etsy fees, your profit per unit is about $10.70, so you need roughly 2 sales per month to break even.</p>
      <p>Use the <a href="/tools/etsy-profit-calculator">Etsy profit calculator</a> to plug in your exact price, cost and fee numbers.</p>
      <h2>When is EverBee not worth it?</h2>
      <p>If you are not listing new products regularly, or if you already get enough demand signals from free Etsy search, a paid plan may not pay for itself. The Hobby plan is enough for occasional research.</p>
      <h2>FAQ</h2>
      <h3>Does EverBee charge per shop?</h3>
      <p>Growth supports multiple store connections; Business adds unlimited stores. Check the current pricing page for the exact limit on your plan.</p>
      <h3>Can I cancel EverBee anytime?</h3>
      <p>Monthly plans can be cancelled before the next billing cycle. Annual plans are billed upfront.</p>
      <h3>Is the EverBee Hobby plan really free?</h3>
      <p>Yes. The Hobby plan is free and does not require a credit card. It is designed to let sellers try the core features before upgrading.</p>
    `,
  },
  "complete-pod-workflow": {
    slug: "complete-pod-workflow",
    title: "A Complete Print-on-Demand Workflow for Etsy",
    metaTitle: "A Complete Print-on-Demand Workflow for Etsy (2026)",
    metaDescription:
      "Step-by-step POD workflow from niche research to listing, including AI design, mockups, and Etsy compliance.",
    datePublished: "2026-07-18",
    dateModified: "2026-07-18",
    primaryKeyword: "print on demand etsy workflow",
    excerpt:
      "Step-by-step POD workflow from niche research to listing, including AI design, mockups, and Etsy compliance.",
    tags: ["print on demand", "POD workflow", "Etsy POD"],
    relatedSlugs: [
      "best-etsy-product-research-workflow-for-pod",
      "compliant-etsy-ai-mockups",
      "tools/etsy-profit-calculator",
    ],
    bodyHtml: `
      <h2>Overview</h2>
      <p>Print-on-demand (POD) lets you sell physical products without inventory. This workflow covers Research → Design → Mockup → List.</p>
      <h2>Step 1: Research</h2>
      <p>Find a niche with buyer intent and low competition. Use Etsy search, review counts, and the <a href="/guide/find-low-competition-etsy-opportunities">low-competition method</a>.</p>
      <h2>Step 2: Design</h2>
      <p>Create the design in Kittl, Canva, or Photoshop. If you use AI generation, keep prompts original and document the process for disclosure.</p>
      <h2>Step 3: Mockup</h2>
      <p>Use realistic mockups from your POD supplier. If you use AI-generated mockups, disclose the AI process and make sure the final printed product looks like the image.</p>
      <h2>Step 4: List</h2>
      <p>Write a keyword-rich title, fill all 13 tags, disclose your production partner, and set a profitable price. Use the <a href="/tools/etsy-profit-calculator">profit calculator</a> to check fees and margin.</p>
      <h2>FAQ</h2>
      <h3>What is the best POD supplier for Etsy?</h3>
      <p>Common options include Printful, Printify, and SPOD. The best supplier depends on product quality, shipping times to your target market, and base cost.</p>
      <h3>Do I need to disclose my POD supplier?</h3>
      <p>Yes. Etsy requires you to disclose your production partner in the relevant listings.</p>
      <h3>How much profit should a POD listing make?</h3>
      <p>Most successful POD sellers aim for at least $5-$8 profit per unit after production, Etsy fees, and advertising. Use the calculator to model your numbers.</p>
    `,
  },
};

export function getAllEtsyGuideSlugs(): string[] {
  return Object.keys(guides);
}

export function getEtsyGuide(slug: string): EtsyGuide | undefined {
  return guides[slug];
}

export function getAllEtsyGuides(): EtsyGuide[] {
  return Object.values(guides);
}
