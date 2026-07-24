import Image from "next/image";
import { calmAuthor } from "@/lib/calmroutine";

export function CalmAuthorBio() {
  return (
    <aside className="mt-12 flex flex-col gap-4 rounded-xl border border-border-subtle bg-card p-6 sm:flex-row sm:items-start">
      <Image
        src={calmAuthor.avatarUrl || "/placeholder.svg"}
        alt={`Portrait of ${calmAuthor.name}`}
        width={72}
        height={72}
        className="h-[72px] w-[72px] shrink-0 rounded-full object-cover"
      />
      <div>
        <p className="text-xs font-medium tracking-wide text-accent-mid">Written by</p>
        <h3 className="mt-1 font-serif text-lg">{calmAuthor.name}</h3>
        <p className="text-sm text-text-secondary">{calmAuthor.credentialLine}</p>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">{calmAuthor.bio}</p>
      </div>
    </aside>
  );
}
