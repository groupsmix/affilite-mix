const sections = [
  {
    heading: "What we collect",
    body: "If you subscribe to the newsletter, we store your email address. If you use the contact form, we store your name, email, and message. That is all.",
  },
  {
    heading: "How we use it",
    body: "Your email is used to send the newsletter and the free PDF. Contact details are used only to reply to you. We never sell or rent your information.",
  },
  {
    heading: "Unsubscribing",
    body: "Every email includes an unsubscribe link. One click and you are removed — no questions, no friction.",
  },
  {
    heading: "Analytics",
    body: "We use privacy-friendly, aggregate analytics to understand which articles are useful. This does not identify you personally.",
  },
];

export function CalmPrivacyPage() {
  return (
    <>
      <h1 className="font-serif text-4xl text-text-primary text-balance">Privacy policy</h1>
      <p className="mt-4 text-lg leading-relaxed text-text-secondary text-pretty">
        The short version: we collect as little as possible and never sell it.
      </p>
      <div className="mt-10 space-y-8">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-serif text-2xl text-text-primary">{section.heading}</h2>
            <p className="mt-2 text-base leading-[1.7] text-text-primary/90">{section.body}</p>
          </section>
        ))}
      </div>
    </>
  );
}
