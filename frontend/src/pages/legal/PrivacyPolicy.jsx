import { Link } from "react-router-dom";
import LegalPageLayout, { Section } from "./LegalPageLayout";

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      description="How Primary Arch collects, uses, and protects your account data."
      path="/privacy-policy"
    >
      <Section heading="What we collect">
        <p>
          When you create an account, we collect your email address, a username you choose,
          and a password (stored as a salted hash, never in plain text). If you play the
          Lineup Builder game or draft a lineup, we store the roster you built, your simulation
          results, and any leaderboard entries tied to your account.
        </p>
        <p>
          We use standard web server logging (IP address, browser type, pages visited) for
          security and abuse prevention. [PLACEHOLDER: confirm whether any third-party
          analytics — e.g. Google Analytics — is active; if so, name it and link to its own
          privacy policy here.]
        </p>
      </Section>

      <Section heading="How we use it">
        <p>
          Account data is used to let you log in, save game results, appear on leaderboards
          under your chosen username, and comment on blog articles. We do not sell your
          personal data to third parties.
        </p>
      </Section>

      <Section heading="Cookies">
        <p>
          The site uses a browser-stored login token (localStorage) to keep you signed in
          between visits. [PLACEHOLDER: list any additional cookies once analytics/ads are
          active — GA4 and AdSense both set their own cookies and need to be disclosed here
          with an opt-out mechanism if the site serves EU/UK visitors.]
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          You can request a copy of the personal data we hold about you, ask us to correct it,
          or ask us to delete your account and associated data. You can delete your account
          yourself at any time: in the RankIt app under Profile → Settings, or on the web at{" "}
          <Link to="/account/delete" style={{ color: "var(--yamabuki)" }}>primaryarch.net/account/delete</Link>.
          Deletion removes your profile and everything tied to it; articles you wrote stay
          published without your name. For any other request, email{" "}
          <a href="mailto:info@primaryarch.net" style={{ color: "var(--yamabuki)" }}>info@primaryarch.net</a>.
          [PLACEHOLDER: if you have EU/UK/California users, add the specific GDPR/UK GDPR/CCPA
          request-handling language a reviewer recommends.]
        </p>
      </Section>

      <Section heading="Children">
        <p>
          Primary Arch is not directed at children under 13, and we do not knowingly collect
          data from them. [PLACEHOLDER: confirm the age threshold that applies in your
          jurisdiction(s) — 13 in the US under COPPA, 16 in some EU member states unless
          lowered by local law.]
        </p>
      </Section>

      <Section heading="Changes to this policy">
        <p>
          We may update this policy as the site changes. Material changes will be reflected
          by an updated "last modified" date on this page once it is finalized.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about this policy:{" "}
          <a href="mailto:info@primaryarch.net" style={{ color: "var(--yamabuki)" }}>info@primaryarch.net</a>{" "}
          or the <Link to="/contact" style={{ color: "var(--yamabuki)" }}>contact page</Link>.
        </p>
      </Section>
    </LegalPageLayout>
  );
}
