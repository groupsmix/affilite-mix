import Image from "next/image";
import Link from "next/link";
import { BookOpen, FlaskConical, ShieldCheck } from "lucide-react";
import { calmAuthor } from "@/lib/calmroutine";

const badges = [
  {
    icon: BookOpen,
    title: "Research-sourced",
    body: "Every claim links back to published research, not vibes.",
  },
  {
    icon: FlaskConical,
    title: "Tested first",
    body: "Routines and products are tried before they are recommended.",
  },
  {
    icon: ShieldCheck,
    title: "No diagnosing",
    body: "Tools, not treatment. Nothing here is medical advice.",
  },
];

export function CalmAboutPage() {
  return (
    <>
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <Image
          src={calmAuthor.avatarUrl || "/placeholder.svg"}
          alt={`Portrait of ${calmAuthor.name}`}
          width={120}
          height={120}
          className="h-[120px] w-[120px] rounded-full object-cover"
        />
        <div>
          <h1 className="font-serif text-4xl text-text-primary">{calmAuthor.name}</h1>
          <p className="mt-2 text-sm text-text-secondary">{calmAuthor.credentialLine}</p>
        </div>
      </div>

      <p className="mt-8 font-serif text-xl leading-relaxed text-text-secondary text-pretty">
        {calmAuthor.bio}
      </p>

      <div className="mt-8 space-y-4 text-base leading-[1.7] text-text-primary/90">
        <p>
          calmroutine exists because most calm advice is either vague or overwhelming. I wanted a
          place for the practical, body-based tools that actually helped me — the ones you can do in
          five minutes without buying anything.
        </p>
        <p>
          I write in plain language, I show my sources, and I try things myself before I put them in
          front of you. If something didn&apos;t help me, it doesn&apos;t make the list.
        </p>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {badges.map((badge) => (
          <div key={badge.title} className="rounded-xl border border-border-subtle bg-card p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-tint">
              <badge.icon className="h-5 w-5 text-accent-dark" aria-hidden="true" />
            </span>
            <h2 className="mt-3 font-serif text-lg text-text-primary">{badge.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">{badge.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-xl border border-border-subtle bg-accent-tint px-6 py-8 text-center">
        <h2 className="font-serif text-2xl text-accent-dark">Have a question?</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          I read everything, even when I can&apos;t reply to all of it.
        </p>
        <Link
          href="/contact"
          className="mt-4 inline-flex rounded-lg bg-accent-dark px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-mid"
        >
          Get in touch
        </Link>
      </div>
    </>
  );
}
