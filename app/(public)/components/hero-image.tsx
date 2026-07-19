import Image from "next/image";

export function HeroImage() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      <Image
        src="/images/hero-crypto-tax-au-dashboard.png"
        alt="Crypto Tax AU dashboard mockup showing capital gains, income, estimated tax and ATO report only"
        width={768}
        height={512}
        priority
        className="h-auto w-full"
        sizes="(max-width: 1024px) 100vw, 50vw"
      />
    </div>
  );
}
