export type Watch = {
  id: string;
  name: string;
  brand: string;
  image: string;
  price: number;
  rating: number;
  reviewCount: number;
  tier: "under-200" | "under-300" | "under-500";
  category: string;
  movement: string;
  waterResistance: string;
  caseSize: string;
  bestFor: string;
  editorNote: string;
  pros: string[];
  cons: string[];
  affiliateUrl: string;
  editorsChoice?: boolean;
};

/**
 * SAMPLE DATA — replace affiliateUrl values with real Amazon/retailer affiliate
 * links and swap names/prices/images for the actual watches as they are tested.
 */
export const watches: Watch[] = [
  {
    id: "navigator-automatic",
    name: "Navigator Automatic",
    brand: "Meridian",
    image: "/watches/diver.png",
    price: 320,
    rating: 4.8,
    reviewCount: 2140,
    tier: "under-500",
    category: "Dive",
    movement: "Automatic",
    waterResistance: "200m",
    caseSize: "40mm",
    bestFor: "Everyday all-rounder",
    editorNote:
      "The best value automatic diver we tested this year. Sapphire crystal and a 200m rating at this price is genuinely rare.",
    pros: ["Sapphire crystal", "True 200m water resistance", "Smooth automatic movement"],
    cons: ["Bracelet uses pin-and-collar links"],
    affiliateUrl: "#",
    editorsChoice: true,
  },
  {
    id: "heritage-field",
    name: "Heritage Field 38",
    brand: "Ridgeline",
    image: "/watches/field.png",
    price: 189,
    rating: 4.7,
    reviewCount: 1580,
    tier: "under-200",
    category: "Field",
    movement: "Mechanical",
    waterResistance: "100m",
    caseSize: "38mm",
    bestFor: "Minimalist everyday wear",
    editorNote:
      "A crisp, legible field watch that punches far above its price. The leather strap feels premium out of the box.",
    pros: ["Excellent legibility", "Quality leather strap", "Hand-wound charm"],
    cons: ["No date window", "Lume is modest"],
    affiliateUrl: "#",
  },
  {
    id: "sterling-dress",
    name: "Sterling Slim",
    brand: "Aveline",
    image: "/watches/dress.png",
    price: 245,
    rating: 4.6,
    reviewCount: 940,
    tier: "under-300",
    category: "Dress",
    movement: "Quartz",
    waterResistance: "30m",
    caseSize: "39mm",
    bestFor: "Formal & office wear",
    editorNote:
      "At just 6.5mm thick, this slips under any cuff. The dauphine hands and clean dial look far more expensive than they are.",
    pros: ["Ultra-thin profile", "Elegant dial", "Great value for formal wear"],
    cons: ["Low water resistance", "Quartz, not mechanical"],
    affiliateUrl: "#",
  },
  {
    id: "retro-digital",
    name: "Retro Digital Gold",
    brand: "Kasato",
    image: "/watches/vintage.png",
    price: 79,
    rating: 4.5,
    reviewCount: 5620,
    tier: "under-200",
    category: "Vintage / Digital",
    movement: "Quartz (Digital)",
    waterResistance: "50m",
    caseSize: "36mm",
    bestFor: "Retro everyday style",
    editorNote:
      "The cult classic. Indestructible, iconic, and impossibly cheap — a no-brainer starter or beater watch.",
    pros: ["Iconic design", "Nearly indestructible", "Incredible price"],
    cons: ["Small display", "Resin-era feel"],
    affiliateUrl: "#",
  },
  {
    id: "circuit-chrono",
    name: "Circuit Chronograph",
    brand: "Meridian",
    image: "/watches/chrono.png",
    price: 420,
    rating: 4.7,
    reviewCount: 760,
    tier: "under-500",
    category: "Chronograph",
    movement: "Meca-quartz",
    waterResistance: "100m",
    caseSize: "41mm",
    bestFor: "Sporty daily driver",
    editorNote:
      "Meca-quartz gives you the snappy pusher feel of a mechanical chrono without the four-figure price tag.",
    pros: ["Snappy chronograph feel", "Panda dial legibility", "Sapphire crystal"],
    cons: ["Slightly thick", "Loud tachymeter styling"],
    affiliateUrl: "#",
  },
  {
    id: "aria-minimalist",
    name: "Aria Minimalist",
    brand: "Aveline",
    image: "/watches/minimalist.png",
    price: 155,
    rating: 4.6,
    reviewCount: 1320,
    tier: "under-200",
    category: "Minimalist",
    movement: "Quartz",
    waterResistance: "30m",
    caseSize: "34mm",
    bestFor: "Women’s everyday minimalist",
    editorNote:
      "A refined 34mm case with a mesh strap that dresses up or down. Our top pick in the women’s minimalist category.",
    pros: ["Elegant mesh strap", "Versatile size", "Great gift option"],
    cons: ["Not water-resistant for swimming"],
    affiliateUrl: "#",
  },
];

export const priceTiers = [
  {
    id: "under-200",
    label: "Under $200",
    tagline: "Best value entry points",
    count: watches.filter((w) => w.tier === "under-200").length,
  },
  {
    id: "under-300",
    label: "Under $300",
    tagline: "The everyday sweet spot",
    count: watches.filter((w) => w.tier === "under-300").length,
  },
  {
    id: "under-500",
    label: "Under $500",
    tagline: "Step-up quality picks",
    count: watches.filter((w) => w.tier === "under-500").length,
  },
] as const;
