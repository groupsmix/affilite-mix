"use client";

const columns = [
  {
    title: "Product",
    links: ["Features", "Pricing", "Changelog", "Roadmap"],
  },
  {
    title: "Resources",
    links: ["Documentation", "API Reference", "Status", "Blog"],
  },
  {
    title: "Company",
    links: ["About", "Privacy", "Terms", "Security"],
  },
  {
    title: "Connect",
    links: ["GitHub", "Twitter / X", "Discord", "Email"],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.06] px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="mb-4 font-mono-accent text-xs font-medium uppercase tracking-widest text-white/30">
                {col.title}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-white/30 transition-colors hover:text-white/60"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 border-t border-white/[0.04] pt-6">
          <p className="font-mono-accent text-center text-[11px] text-white/15">
            Built at the edge. Deployed in 38ms. © Affilite-Mix.
          </p>
        </div>
      </div>
    </footer>
  );
}
