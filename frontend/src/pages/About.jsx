import { useLang } from "../contexts/LanguageContext";

const CHANGELOG = [
  {
    version: "v1.1",
    date: "Haziran 2026",
    date_en: "June 2026",
    label: "Oyun & Pozisyon Güncellemesi",
    label_en: "Game & Position Update",
    items_tr: [
      "Tarihsel oyuncular için pozisyon tahmini düzeltildi (LeBron, Kawhi artık SF/PF görünüyor)",
      "Oyun sonunda zayıf pillar için somut oyuncu önerisi (isim + sezon + takım)",
      "2TM/3TM/TOT oyuncuları oyundan filtrelendi — her takım kendi kadrosuyla",
      "Jokerler artık mevcut sezon/takımı tekrar seçmiyor",
      "Oyun sayfasına açıklama + arketip strateji rehberi eklendi",
      "Arketip haritasındaki cluster daireleri kaldırıldı",
      "Site tamamen İngilizce'ye geçirildi",
      "Sayfa yenileme ve direkt link erişimi artık 404 vermiyor (SPA routing düzeltildi)",
    ],
    items_en: [
      "Historical player positions fixed — LeBron, Kawhi now correctly shown as SF/PF",
      "Post-game analysis suggests a specific player by name for your weakest pillar",
      "2TM/3TM/TOT rows removed from game — each team shows its own roster",
      "Jokers no longer re-spin the same season or team",
      "Game page now includes a full explanation and archetype strategy guide",
      "Cluster circles removed from the Archetype Map",
      "Site switched to English-only",
      "Page refresh and direct links no longer return 404 (SPA routing fixed)",
    ],
  },
  {
    version: "v1.0",
    date: "Haziran 2026",
    date_en: "June 2026",
    label: "İlk Sürüm",
    label_en: "Initial Release",
    items_tr: [
      "12 temel arketip + 22 modifier tag sistemi",
      "1989-90'dan günümüze tüm oyunculara persantil tabanlı puanlama",
      "5 pilarlı lineup uyum motoru (Creation · Spacing · Defense · Finishing · Role Fit)",
      "Arketip affinite matrisi — hangi arketipler kazanır?",
      "Tarihsel oyuncu arama ve radar profilleri",
      "Lineup Builder oyunu — farklı dönemlerden kadro kur",
      "Oyuncu karşılaştırma sayfası",
    ],
    items_en: [
      "12 core archetypes + 22 modifier tag system",
      "Percentile-based scoring for all players from 1989-90 to present",
      "5-pillar lineup fit engine (Creation · Spacing · Defense · Finishing · Role Fit)",
      "Archetype affinity matrix — which archetypes win together?",
      "Historical player search with radar profiles",
      "Lineup Builder game — build a roster across different eras",
      "Player comparison page",
    ],
  },
];

const CONTENT = {
  tr: {
    title: "Hakkımızda",
    mission_label: "Misyon",
    mission: `NBA'i sayılarla değil, kimliklerle anlamak. Her oyuncu bir istatistik satırından fazlasıdır —
    sahada üstlendiği rol, takım sistemine katkısı ve rakip üzerindeki baskısı bir bütün olarak
    bir "arketip" oluşturur. Biz bu arketipleri tanımlamayı, ölçmeyi ve birbiriyle nasıl uyum kurduklarını
    keşfetmeyi hedefliyoruz.`,

    vision_label: "Vizyon",
    vision: `Oyuncu değerlendirmesinde jargon ile veriyi birleştiren, hem scouting perspektifini
    hem de istatistiksel derinliği aynı çatı altında sunan bir referans platform.
    Bir oyuncunun "Ecosystem Engine" mi yoksa "Pressure Scoring Three-Level Creator" mı olduğunu
    tek bakışta görebileceğiniz, lineup uyumlarını teorik olarak test edebileceğiniz
    ve tarihsel dönemler arasında karşılaştırma yapabileceğiniz bir sistem.`,

    what_label: "Ne Yapıyoruz?",
    what: [
      {
        icon: "🏷",
        title: "Arketip Etiketleme",
        text: `12 temel arketip (Ecosystem, Engine, Anchor, Spacer…) ve 22 modifier tag (Pressure, Gravity, Switchable…)
        kullanarak her oyuncuya çok katmanlı bir kimlik atıyoruz. Etiketler elle hazırlanan bir jargon sözlüğüne
        dayanıyor; metrikler bu tanımları doğrulayıp genişletiyor.`,
      },
      {
        icon: "📐",
        title: "Persantil Tabanlı Puanlama",
        text: `Ham istatistikler dönemler arası karşılaştırılabilir değildir. Bu yüzden tüm metrikler
        sezon içi persantil sırasına dönüştürülüyor. 1990'daki bir oyuncu ile 2025-26 sezonundaki bir oyuncuyu
        aynı ölçekte değerlendirmenin tek güvenilir yolu budur.`,
      },
      {
        icon: "🔗",
        title: "Lineup Uyumu",
        text: `11 fonksiyonel rol slotuna (Primary Creation, Floor Spacing, Interior Defense…) dayanan
        bir uyum motoru, teorik olarak en iyi 5'li kadroları hesaplıyor. Switch kabiliyeti ve
        şut yaratma derinliği gibi gerçek NBA dinamiklerini yansıtan metrikler de formüle dahil edildi.`,
      },
      {
        icon: "📚",
        title: "Tarihsel Derinlik",
        text: `1989-90 sezonundan itibaren tüm sezonları kapsıyoruz. Eski sezonlarda eksik olan tracking
        ve hustle metrikleri için fallback imzalar tanımlandı; böylece Michael Jordan ile
        Shai Gilgeous-Alexander aynı çerçevede değerlendirilebiliyor.`,
      },
      {
        icon: "🗺",
        title: "Arketip Haritası",
        text: `12 boyutlu skor vektörü PCA (Temel Bileşen Analizi) ile 2 boyuta indirgenerek
        interaktif bir saçılım grafiğinde görselleştirilir. Hangi oyuncuların birbirine
        benzediğini, hangi arketiplerin kümelendiğini ve ligin demografik dağılımını
        tek bakışta görebilirsiniz.`,
      },
    ],

    philosophy_label: "Felsefemiz",
    philosophy: `Basketbol analizi çoğu zaman iki ayrı dünyada yaşar: sahadan uzak soyut istatistikler
    ile sayıyı görmezden gelen scouting jargonu. Biz bu iki dünyayı köprüleyen bir dil kurmaya çalışıyoruz.

    Bir oyuncu "iyi" ya da "kötü" değildir — doğru sistemde, doğru kadro bağlamında "uygun" ya da "uyumsuz"dur.
    Nikola Jokić beş oyuncudan oluşan bir kadronun merkezi olabilir ya da başka bir dominant Force oyuncusunun
    yanında gereksiz bir tekrar yaratabilir. Arketip sistemi bu uyumu görünür kılar.

    Veriye güveniyoruz, ama verinin her şeyi anlatmadığını da biliyoruz. Bu yüzden
    hesaplamaların yanında her lineup için otomatik üretilen açıklamalar, rol kırılımları
    ve sezon içi kazanma korelasyonları sunuyoruz — sizi sayfa arkasında bırakmak yerine
    içgörüye taşımak için.`,

    authors_label: "Hazırlayanlar",
    authors: [
      { name: "Gökdeniz Gören" },
    ],

    disclaimer: `Bu site resmi bir NBA ürünü değildir. Tüm veriler nba_api aracılığıyla stats.nba.com'dan
    çekilmektedir. Arketip tanımları ve etiketler tamamen özgün yorumsal çalışmanın ürünüdür.`,
  },

  en: {
    title: "About",
    mission_label: "Mission",
    mission: `To understand the NBA through identities, not just numbers. Every player is more than a stat line —
    their role on the floor, their contribution to the team system, and the pressure they apply
    on opponents together form an "archetype." We aim to define, measure, and explore
    how these archetypes fit together.`,

    vision_label: "Vision",
    vision: `A reference platform that bridges scouting jargon with statistical depth,
    presenting both perspectives under one roof. A system where you can see at a glance
    whether a player is an "Ecosystem Engine" or a "Pressure Scoring Three-Level Creator,"
    theoretically test lineup compatibility, and compare across historical eras.`,

    what_label: "What We Do",
    what: [
      {
        icon: "🏷",
        title: "Archetype Tagging",
        text: `Using 12 core archetypes (Ecosystem, Engine, Anchor, Spacer…) and 22 modifier tags
        (Pressure, Gravity, Switchable…), we assign a multi-layered identity to each player.
        Tags are grounded in a hand-crafted jargon dictionary; metrics validate and extend these definitions.`,
      },
      {
        icon: "📐",
        title: "Percentile-Based Scoring",
        text: `Raw statistics are not comparable across eras. That's why all metrics are converted
        to within-season percentile ranks. This is the only reliable way to evaluate a 1990 player
        on the same scale as a 2025-26 player.`,
      },
      {
        icon: "🔗",
        title: "Lineup Compatibility",
        text: `A compatibility engine built on 11 functional role slots (Primary Creation, Floor Spacing,
        Interior Defense…) computes the theoretically best 5-man lineups. Metrics reflecting
        real NBA dynamics — switch ability and shot creation depth — are baked into the formula.`,
      },
      {
        icon: "📚",
        title: "Historical Depth",
        text: `We cover all seasons from 1989-90 onward. Fallback signatures handle missing tracking
        and hustle metrics in older seasons, allowing Michael Jordan and Shai Gilgeous-Alexander
        to be evaluated within the same framework.`,
      },
      {
        icon: "🗺",
        title: "Archetype Map",
        text: `The 12-dimensional score vector is reduced to 2 dimensions via PCA (Principal Component Analysis)
        and visualized as an interactive scatter plot. See at a glance which players are similar,
        how archetypes cluster, and the demographic spread of the league.`,
      },
    ],

    philosophy_label: "Our Philosophy",
    philosophy: `Basketball analysis too often lives in two separate worlds: abstract statistics detached
    from the game, and scouting jargon that ignores the numbers. We're building a language that bridges both.

    A player is not simply "good" or "bad" — they are "fit" or "misfit" in the right system,
    the right roster context. Nikola Jokić can be the centerpiece of a five-man unit
    or create redundancy next to another dominant Force player.
    The archetype system makes this compatibility visible.

    We trust the data, but we also know data doesn't tell the whole story. That's why alongside
    the calculations we provide auto-generated lineup explanations, role breakdowns,
    and season-level win correlations — to carry you from numbers to insight,
    not leave you buried in spreadsheets.`,

    authors_label: "Created By",
    authors: [
      { name: "Gökdeniz Gören" },
    ],

    disclaimer: `This site is not an official NBA product. All data is sourced from stats.nba.com via the nba_api library.
    Archetype definitions and tags are entirely the product of original interpretive work.`,
  },
};

export default function About() {
  const { lang } = useLang();
  const c = CONTENT[lang] || CONTENT.tr;

  return (
    <div className="p-6 max-w-6xl mx-auto pb-16">
    <div className="flex gap-8 items-start">
    {/* Sol kolon — ana içerik */}
    <div className="flex-1 space-y-10 min-w-0">

      {/* Hero */}
      <div className="text-center pt-4 pb-2">
        <div className="text-4xl mb-3">🏀</div>
        <h1 className="text-2xl font-bold text-white mb-2">{c.title}</h1>
        <p className="text-slate-500 text-sm">NBA Archetype System</p>
      </div>

      {/* Mission & Vision */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: c.mission_label, text: c.mission,  icon: "🎯", accent: "border-blue-600/40 bg-blue-950/20" },
          { label: c.vision_label,  text: c.vision,   icon: "🔭", accent: "border-sky-600/40 bg-sky-950/20"  },
        ].map(({ label, text, icon, accent }) => (
          <div key={label} className={`border rounded-2xl p-5 ${accent}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{icon}</span>
              <h2 className="font-semibold text-white text-sm">{label}</h2>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">{text}</p>
          </div>
        ))}
      </div>

      {/* What we do */}
      <div>
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-blue-500 rounded-full inline-block" />
          {c.what_label}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {c.what.map(({ icon, title, text }) => (
            <div key={title} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{icon}</span>
                <span className="text-sm font-medium text-white">{title}</span>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Philosophy */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-blue-500 rounded-full inline-block" />
          {c.philosophy_label}
        </h2>
        <div className="space-y-3">
          {c.philosophy.split("\n\n").map((para, i) => (
            <p key={i} className="text-slate-400 text-sm leading-relaxed">{para.trim()}</p>
          ))}
        </div>
      </div>

      {/* Authors */}
      <div>
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <span className="w-1 h-5 bg-blue-500 rounded-full inline-block" />
          {c.authors_label}
        </h2>
        <div className="flex">
          {c.authors.map(({ name }) => (
            <div key={name} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-900/60 border border-blue-700/40 flex items-center justify-center text-blue-300 font-bold text-sm shrink-0">
                {name.split(" ").map(w => w[0]).join("").slice(0, 2)}
              </div>
              <div className="text-white font-semibold text-sm">{name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="border-t border-slate-800 pt-6">
        <p className="text-slate-600 text-xs leading-relaxed text-center">{c.disclaimer}</p>
        <p className="text-slate-700 text-[10px] text-center mt-2">
          © 2025-26 · Gökdeniz Gören
        </p>
      </div>

    </div>{/* /sol kolon */}

    {/* Sağ kolon — Sürüm notları */}
    <div className="w-72 shrink-0 sticky top-6 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-1 h-5 bg-blue-500 rounded-full inline-block" />
        <h2 className="text-white font-semibold text-sm">
          {lang === "tr" ? "Sürüm Notları" : "Release Notes"}
        </h2>
      </div>
      {CHANGELOG.map((entry) => (
        <div key={entry.version} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          {/* Versiyon başlık */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-400 bg-blue-950/50 border border-blue-800/40 px-2 py-0.5 rounded-full">
              {entry.version}
            </span>
            <span className="text-[10px] text-slate-500">
              {lang === "tr" ? entry.date : entry.date_en}
            </span>
          </div>
          <div className="text-[11px] font-semibold text-slate-300">
            {lang === "tr" ? entry.label : entry.label_en}
          </div>
          {/* Madde listesi */}
          <ul className="space-y-1.5">
            {(lang === "tr" ? entry.items_tr : entry.items_en).map((item, i) => (
              <li key={i} className="flex gap-2 text-[11px] text-slate-400 leading-relaxed">
                <span className="text-blue-500 mt-0.5 shrink-0">+</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-[10px] text-slate-600 text-center pt-1">
        {lang === "tr" ? "Daha fazla güncelleme yakında" : "More updates coming soon"}
      </p>
    </div>

    </div>{/* /flex wrapper */}
    </div>
  );
}
