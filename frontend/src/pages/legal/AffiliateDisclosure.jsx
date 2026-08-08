import LegalPageLayout, { Section } from "./LegalPageLayout";

export default function AffiliateDisclosure() {
  return (
    <LegalPageLayout
      title="Affiliate Disclosure"
      description="How Primary Arch may earn a commission from links on the site."
      path="/affiliate-disclosure"
    >
      <Section>
        <p>
          Some links on Primary Arch — for example, links to fantasy-sports platforms like
          Sorare NBA or Yahoo Fantasy — may be affiliate links. If you click one and sign up
          or make a purchase, we may earn a commission at no extra cost to you.
        </p>
        <p>
          [PLACEHOLDER: this page is written ahead of any affiliate program actually being
          approved (see roadmap Faz 4.1 — those applications haven't been submitted yet). Once
          a program is live, list the specific partners here by name, and confirm this
          disclosure meets that program's required disclosure language (Amazon Associates,
          for instance, has its own mandated wording).]
        </p>
        <p>
          Affiliate relationships never influence how a player, lineup, or archetype is
          scored — the rating engine has no knowledge of, or connection to, any affiliate
          program.
        </p>
      </Section>
    </LegalPageLayout>
  );
}
