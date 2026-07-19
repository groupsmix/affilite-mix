import Image from "next/image";

export function HeroImage() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      <Image
        src="/images/hero-crypto-tax-au.png"
        alt="Crypto Tax AU dashboard mockup showing portfolio summary, capital gains and ATO-ready tax summary"
        width={768}
        height={512}
        priority
        className="h-auto w-full"
        sizes="(max-width: 1024px) 100vw, 50vw"
      />
    </div>
  );
}
