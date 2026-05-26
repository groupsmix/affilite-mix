"use client";

import { HeroSection } from "./sections/hero";
import { FleetSection } from "./sections/fleet";
import { ContentPipelineSection } from "./sections/content-pipeline";
import { ClickDashboardSection } from "./sections/click-dashboard";
import { MultiTenantSection } from "./sections/multi-tenant";
import { EconomicsSection } from "./sections/economics";
import { ShipCommandSection } from "./sections/ship-command";
import { TrustSection } from "./sections/trust";
import { TestimonialsSection } from "./sections/testimonials";
import { PricingSection } from "./sections/pricing";
import { FaqSection } from "./sections/faq";
import { FinalCtaSection } from "./sections/final-cta";
import { LandingFooter } from "./sections/footer";
import { TenantTerminal } from "./components/tenant-terminal";

export default function LandingPage() {
  return (
    <main className="relative">
      <HeroSection />
      <FleetSection />
      <ContentPipelineSection />
      <ClickDashboardSection />
      <MultiTenantSection />
      <EconomicsSection />
      <ShipCommandSection />
      <TrustSection />
      <TestimonialsSection />
      <PricingSection />
      <FaqSection />
      <FinalCtaSection />
      <LandingFooter />
      <TenantTerminal />
    </main>
  );
}
