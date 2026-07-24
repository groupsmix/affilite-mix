import { CalmContactForm } from "./contact-form";

export function CalmContactPage() {
  return (
    <>
      <h1 className="font-serif text-4xl text-text-primary text-balance">Get in touch</h1>
      <p className="mt-4 text-lg leading-relaxed text-text-secondary text-pretty">
        Questions, corrections, or a routine that helped you — I&apos;d love to hear it. This form
        is for general messages only and is not a place for medical questions.
      </p>
      <div className="mt-10">
        <CalmContactForm />
      </div>
    </>
  );
}
