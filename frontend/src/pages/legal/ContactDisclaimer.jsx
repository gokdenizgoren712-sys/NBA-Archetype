import LegalPageLayout, { Section } from "./LegalPageLayout";

export default function ContactDisclaimer() {
  return (
    <LegalPageLayout
      title="Contact & Disclaimer"
      description="How to reach Primary Arch, and a general disclaimer about the site's content."
      path="/contact"
    >
      <Section heading="Contact">
        <p>
          Email: <a href="mailto:info@primaryarch.net" style={{ color: "var(--yamabuki)" }}>info@primaryarch.net</a>
        </p>
        <p>
          You can also reach us on{" "}
          <a href="https://x.com/primary_arch" target="_blank" rel="noopener noreferrer" style={{ color: "var(--yamabuki)" }}>X (Twitter)</a>
          {" "}and{" "}
          <a href="https://www.instagram.com/primary_arch" target="_blank" rel="noopener noreferrer" style={{ color: "var(--yamabuki)" }}>Instagram</a>.
        </p>
      </Section>

      <Section heading="Disclaimer">
        <p>
          Primary Arch is an independent stats and entertainment project. It is not
          affiliated with, endorsed by, or sponsored by the NBA, WNBA, NCAA, EuroLeague, any
          G-League team, or any of their players, teams, or leagues. All team names, player
          names, and league names are used for identification and commentary purposes only.
        </p>
        <p>
          Player archetypes and scores are the site's own statistical opinions, generated
          algorithmically from public data — they are not official league statistics or
          endorsed rankings.
        </p>
      </Section>

      <Section heading="Data sources">
        <p>
          Statistics are sourced from publicly available data (e.g. stats.nba.com and other
          public basketball-statistics providers). [PLACEHOLDER: a reviewer should confirm
          each data source's terms of use permit this kind of public, non-commercial-or-
          commercial (whichever applies) redisplay and derived scoring.]
        </p>
      </Section>
    </LegalPageLayout>
  );
}
