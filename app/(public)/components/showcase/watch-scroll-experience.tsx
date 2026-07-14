"use client";

import { useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import type { Group } from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { WatchModel } from "./watch-model";

gsap.registerPlugin(ScrollTrigger);

/** Lives inside the Canvas — wires the GSAP scroll timeline to the 3D group. */
function ScrollRig() {
  const groupRef = useRef<Group>(null);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: "#watch-scroll-container",
          start: "top top",
          end: "bottom bottom",
          scrub: true, // animation is driven 1:1 by scroll, forward and backward
        },
      });

      // Section 1 -> 2: rotate 180° to reveal the caseback while scaling up
      tl.to(group.rotation, { y: Math.PI, duration: 1, ease: "none" }, 0);
      tl.to(group.scale, { x: 1.45, y: 1.45, z: 1.45, duration: 1, ease: "none" }, 0);

      // Section 2 -> 3: tilt horizontally and drift to the right of the screen
      tl.to(group.rotation, { y: Math.PI * 2, x: 1.15, z: -0.35, duration: 1, ease: "none" }, 1);
      tl.to(group.position, { x: 2.4, y: -0.2, duration: 1, ease: "none" }, 1);
      tl.to(group.scale, { x: 1.2, y: 1.2, z: 1.2, duration: 1, ease: "none" }, 1);
    });

    return () => ctx.revert();
  }, []);

  return (
    <group position={[0, 0.55, 0]}>
      <WatchModel ref={groupRef} />
    </group>
  );
}

/** Fades each text block in/out as its section crosses the viewport. */
function useSectionFades(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-fade]").forEach((block) => {
        gsap.fromTo(
          block,
          { opacity: 0, y: 48 },
          {
            opacity: 1,
            y: 0,
            ease: "none",
            scrollTrigger: {
              trigger: block,
              start: "top 85%",
              end: "top 45%",
              scrub: true,
            },
          },
        );
      });
    }, el);

    return () => ctx.revert();
  }, [root]);
}

interface WatchScrollExperienceProps {
  siteName: string;
  productLabelPlural: string;
}

export function WatchScrollExperience({
  siteName,
  productLabelPlural,
}: WatchScrollExperienceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useSectionFades(rootRef);

  return (
    <div
      ref={rootRef}
      id="watch-scroll-container"
      className="relative bg-background text-foreground"
    >
      {/* Sticky 3D layer — pinned while the 3 sections scroll, then releases so the page continues to products */}
      <div className="pointer-events-none sticky top-0 z-0 h-screen w-full">
        <Canvas camera={{ position: [0, 0, 6.5], fov: 42 }} gl={{ antialias: true }}>
          <color attach="background" args={["#0a0a0c"]} />
          <ambientLight intensity={0.65} />
          <hemisphereLight args={["#d4af37", "#1a1a1e", 0.55]} />
          <directionalLight position={[4, 6, 5]} intensity={1.4} />
          <directionalLight position={[-5, -2, -4]} intensity={0.4} color="#c9a227" />
          <pointLight position={[0, 0, 8]} intensity={0.8} />
          <ScrollRig />
        </Canvas>
      </div>

      {/* Scroll sections (3 x 100vh) overlaid on the sticky canvas */}
      <div className="relative z-10 -mt-[100vh]">
        {/* Section 1 — watch facing forward */}
        <section className="flex h-screen flex-col items-center justify-end pb-24 text-center">
          <div data-fade className="flex flex-col items-center gap-4 px-6">
            <p className="text-xs uppercase tracking-[0.4em] text-primary">{siteName} Signature</p>
            <h2 className="showcase-serif text-5xl text-balance md:text-7xl">The Meridian One</h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Scroll to explore every angle of a watch engineered for obsessives.
            </p>
            <span className="mt-6 animate-bounce text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Scroll
            </span>
          </div>
        </section>

        {/* Section 2 — rotates 180° to show the caseback */}
        <section className="flex h-screen items-end justify-center pb-24 md:items-center md:justify-end md:pb-0">
          <div data-fade className="flex max-w-sm flex-col gap-4 px-6 md:pr-16">
            <p className="text-xs uppercase tracking-[0.4em] text-primary">02 — The Movement</p>
            <h2 className="showcase-serif text-3xl text-balance md:text-5xl">Precision, Exposed</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Flip it over. A decorated automatic calibre with a gilded rotor, visible through the
              exhibition caseback — because the back of a watch should be as honest as the front.
            </p>
          </div>
        </section>

        {/* Section 3 — watch tilts and moves right, copy sits on the left */}
        <section className="flex h-screen items-center">
          <div data-fade className="flex max-w-md flex-col gap-5 px-6 md:pl-20">
            <p className="text-xs uppercase tracking-[0.4em] text-primary">03 — On the Wrist</p>
            <h2 className="showcase-serif text-3xl text-balance md:text-5xl">Built to Be Worn</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              A 40mm brushed case, gold bezel, and sapphire crystal. Every angle considered, every
              surface finished. This is the reference point we judge every recommendation against.
            </p>
            <a
              href="#collection"
              className="pointer-events-auto mt-2 inline-flex w-fit items-center border border-primary px-8 py-3 text-xs uppercase tracking-[0.3em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              Shop the {productLabelPlural}
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
