import { Link } from "react-router-dom";
import LegalPageLayout, { Section } from "./LegalPageLayout";

// Mağaza şartı (Apple 1.2, Google Play UGC): izin verilmeyen içerik, şikâyet
// ve engelleme yolu, 24 saatlik inceleme taahhüdü, tekrarında hesap kapatma.
// Uygulama ve kayıt formu buraya bağlanıyor (docs/RANKIT_STORE_BLOCKERS_PLAN.md B7).
// Metin değişirse api/main.py TERMS_VERSION ilerletilir: kullanıcılara
// "Updated terms" bandı çıkar.
const LINK = { color: "var(--yamabuki)" };

export default function CommunityGuidelines() {
  return (
    <LegalPageLayout
      title="Community Guidelines"
      description="What you can post on Primary Arch and RankIt, how reporting and blocking work, and what happens when someone breaks the rules."
      path="/community-guidelines"
    >
      <Section heading="Where these apply">
        <p>
          Everywhere you can post or talk on Primary Arch: RankIt reviews and replies, lists
          (titles, descriptions and notes), live match chat, usernames, and blog comments.
          They sit alongside the <Link to="/terms-of-service" style={LINK}>Terms of Service</Link>,
          which you agree to when you create an account.
        </p>
      </Section>

      <Section heading="Zero tolerance">
        <p>We don&apos;t allow, anywhere, in any language:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Hate speech or slurs targeting race, ethnicity, nationality, religion, gender, sexual orientation, disability or any other protected group.</li>
          <li>Harassment, bullying, threats or encouraging violence — against players, referees, fans or other members.</li>
          <li>Sexual content, and anything that sexualises minors.</li>
          <li>Spam, scams, advertising, betting tips or links to them.</li>
          <li>Sharing someone&apos;s private information, or pretending to be someone else.</li>
          <li>Anything illegal.</li>
        </ul>
        <p>
          Strong opinions about matches, teams and players are welcome — criticise the play,
          not the person. Mark reviews that give away a result as spoilers.
        </p>
      </Section>

      <Section heading="Filtering">
        <p>
          Posts are checked before they&apos;re published. Slurs and the strongest profanity are
          blocked, and links aren&apos;t allowed in replies or chat. The filter is only the first
          line: reports from members are how the rest gets caught.
        </p>
      </Section>

      <Section heading="Reporting">
        <p>
          Every review, reply, list, chat message and profile has a <strong>⋯</strong> menu with
          <strong> Report</strong>. Pick a reason and, if you like, add a note. We review every
          report <strong>within 24 hours</strong>. When several members report the same post it
          is hidden straight away while we look at it.
        </p>
        <p>
          You can also write to{" "}
          <a href="mailto:info@primaryarch.net" style={LINK}>info@primaryarch.net</a> or use the{" "}
          <Link to="/contact" style={LINK}>contact page</Link>.
        </p>
      </Section>

      <Section heading="Blocking">
        <p>
          The same <strong>⋯</strong> menu has <strong>Block</strong>. Once you block someone,
          neither of you sees the other&apos;s reviews, replies, lists or chat messages, you both
          stop following each other, and they can&apos;t follow you or reply to you. They
          aren&apos;t told. You can unblock from RankIt → Settings → Blocked accounts.
        </p>
      </Section>

      <Section heading="What happens when rules are broken">
        <p>
          Content that breaks these guidelines is removed. Accounts that post it — or keep
          coming back after a removal — are suspended, and serious cases (hate speech, threats,
          sexual content involving minors) are closed on the first offence. Where the law
          requires it, we report illegal content to the authorities.
        </p>
      </Section>
    </LegalPageLayout>
  );
}
