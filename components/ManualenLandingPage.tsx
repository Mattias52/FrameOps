import React, { useEffect, useRef, useState } from 'react';
import { AppView } from '../types';
import { useAuth } from '../contexts/AuthContext';
import './ManualenLandingPage.css';

interface ManualenLandingPageProps {
  onNavigate: (view: AppView) => void;
  onGetStarted: () => void;
}

const ManualenLandingPage: React.FC<ManualenLandingPageProps> = ({ onNavigate, onGetStarted }) => {
  const { user, loading } = useAuth();
  const pageRef = useRef<HTMLDivElement>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Auto-enter app when user is logged in
  useEffect(() => {
    if (!loading && user) {
      onGetStarted();
    }
  }, [user, loading, onGetStarted]);

  // SEO — set document title and meta description with target keywords
  useEffect(() => {
    document.title = 'Skapa Manual Fr\u00e5n Video | AI SOP-Generator & Arbetsinstruktioner | Manualen.nu';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Skapa manualer och arbetsinstruktioner fr\u00e5n video automatiskt med AI. Filma arbetet, ladda upp video eller klistra in YouTube-l\u00e4nk \u2014 f\u00e5 en komplett steg-f\u00f6r-steg-manual med bilder. SOP-generator f\u00f6r tillverkning, sjukv\u00e5rd och logistik. Gratis att testa.');
    }
  }, []);

  // Fade-in on scroll
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const targets = el.querySelectorAll('.mn-fade-in');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('mn-visible');
        }
      });
    }, { threshold: 0.15 });

    targets.forEach(t => observer.observe(t));
    return () => observer.disconnect();
  }, []);

  const faqItems = [
    {
      question: 'Vad \u00e4r en SOP-generator?',
      answer: 'En SOP-generator \u00e4r ett verktyg som automatiskt skapar standardrutiner (Standard Operating Procedures) fr\u00e5n videoinneh\u00e5ll. Manualen.nu anv\u00e4nder AI f\u00f6r att analysera video, identifiera steg, ta sk\u00e4rmbilder och producera professionella steg-f\u00f6r-steg-manualer och arbetsinstruktioner.'
    },
    {
      question: 'Hur skapar jag en manual fr\u00e5n en video?',
      answer: 'Med Manualen.nu kan du skapa manualer fr\u00e5n video p\u00e5 tre s\u00e4tt: ladda upp en videofil, klistra in en YouTube-l\u00e4nk eller filma live med mobilkameran. AI:n identifierar varje steg automatiskt, tar bilder och genererar en strukturerad manual du kan redigera och exportera som PDF.'
    },
    {
      question: '\u00c4r Manualen.nu gratis att anv\u00e4nda?',
      answer: 'Ja, Manualen.nu \u00e4r gratis under betaperioden. Alla funktioner ing\u00e5r utan begr\u00e4nsningar: videouppladdning, YouTube-import, liveinspelning, sk\u00e4rminspelning, AI-stegdetektion och PDF-export.'
    },
    {
      question: 'Vilka branscher kan anv\u00e4nda Manualen.nu?',
      answer: 'Manualen.nu passar alla branscher d\u00e4r arbetsprocesser beh\u00f6ver dokumenteras: tillverkning, sjukv\u00e5rd, livsmedel, bygg, lager och logistik, el och installation, IT-drift, utbildning och onboarding. Alla processer som kan filmas kan bli professionella manualer och SOP:er.'
    },
    {
      question: 'Kan jag g\u00f6ra en manual av en YouTube-video?',
      answer: 'Ja, klistra in en YouTube-l\u00e4nk i Manualen.nu s\u00e5 analyserar AI:n videon, extraherar nyckelbilder, transkriberar ljudet och genererar en steg-f\u00f6r-steg-manual som du kan redigera och exportera som PDF. Perfekt f\u00f6r att omvandla instruktionsvideo till manual.'
    },
    {
      question: 'Vad \u00e4r skillnaden mellan en manual och en SOP?',
      answer: 'En SOP (Standard Operating Procedure) \u00e4r en typ av manual som beskriver standardrutiner f\u00f6r ett specifikt arbetsmoment. Manualen.nu skapar b\u00e5de allm\u00e4nna manualer och detaljerade SOP:er fr\u00e5n video, med bilder, verktygslistor och s\u00e4kerhetsvarningar. B\u00e5de procedurmanualer och arbetsinstruktioner st\u00f6ds.'
    }
  ];

  return (
    <div className="manualen-page" ref={pageRef} lang="sv">
      {/* Nav */}
      <nav className="mn-nav" aria-label="Huvudnavigering">
        <div className="mn-nav-inner">
          <button className="mn-logo" onClick={() => onNavigate(AppView.LANDING)} aria-label="Manualen.nu - Startsida">
            <img src="/manualen/logo.png" alt="Manualen.nu logotyp" className="mn-logo-icon" />
            manualen<span>.nu</span>
          </button>
          <button className="mn-nav-cta" onClick={onGetStarted}>Testa gratis</button>
        </div>
      </nav>

      {/* Hero */}
      <header className="mn-hero">
        <div className="mn-hero-content">
          <p className="mn-hero-tag">AI SOP-generator f&ouml;r svenska f&ouml;retag</p>
          <h1>Skapa manual fr&aring;n video &mdash; automatiskt med AI</h1>
          <p className="mn-hero-sub">
            Filma arbetet med mobilen. AI:n analyserar videon och skapar en komplett
            steg-f&ouml;r-steg-manual med bilder, arbetsinstruktioner och s&auml;kerhetsvarningar &mdash; automatiskt.
          </p>
          <div className="mn-hero-actions">
            <button className="mn-btn-primary" onClick={onGetStarted}>Prova gratis &mdash; skapa din f&ouml;rsta manual</button>
            <span className="mn-hero-note">Ingen registrering kr&auml;vs</span>
          </div>
        </div>
        <div className="mn-hero-image">
          <img src="/manualen/hero.png" alt="Skapa manual fr&aring;n video &mdash; tekniker filmar sitt arbete med mobilen f&ouml;r att generera arbetsinstruktioner" width="512" height="512" fetchPriority="high" />
        </div>
      </header>

      {/* Social proof bar */}
      <section className="mn-proof-bar" aria-label="Nyckeltal">
        <div className="mn-proof-inner">
          <div className="mn-proof-item">
            <strong>10 min video</strong>
            <span>blev 15-stegs manual</span>
          </div>
          <div className="mn-proof-divider"></div>
          <div className="mn-proof-item">
            <strong>PDF-klar</strong>
            <span>skriv ut direkt</span>
          </div>
          <div className="mn-proof-divider"></div>
          <div className="mn-proof-item">
            <strong>Svenska</strong>
            <span>AI:n f&ouml;rst&aring;r svenska</span>
          </div>
        </div>
      </section>

      <main>
        {/* How it works */}
        <section className="mn-how" id="sa-funkar-det">
          <div className="mn-how-inner">
            <h2>S&aring; skapar du en manual fr&aring;n video &mdash; tre steg</h2>
            <p className="mn-how-intro">
              Skapa professionella arbetsinstruktioner och standardrutiner utan att skriva en enda rad.
              V&aring;r AI SOP-generator g&ouml;r allt &aring;t dig.
            </p>
            <div className="mn-how-steps">
              <div className="mn-how-step mn-fade-in">
                <div className="mn-how-num">1</div>
                <h3>Filma arbetsprocessen</h3>
                <p>St&auml;ll mobilen mot v&auml;ggen eller be en kollega h&aring;lla. Filma som vanligt medan du jobbar. AI:n f&ouml;rst&aring;r svenska.</p>
              </div>
              <div className="mn-how-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </div>
              <div className="mn-how-step mn-fade-in">
                <div className="mn-how-num">2</div>
                <h3>Ladda upp video</h3>
                <p>Dra in videon p&aring; sidan, klistra in en YouTube-l&auml;nk eller anv&auml;nd sk&auml;rminspelning. AI:n analyserar bild och ljud och identifierar varje steg.</p>
              </div>
              <div className="mn-how-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </div>
              <div className="mn-how-step mn-fade-in">
                <div className="mn-how-num">3</div>
                <h3>F&auml;rdig manual</h3>
                <p>Redigera om du vill. Exportera som PDF. Skriv ut, laminera och dela med teamet. Dina procedurmanualer &auml;r redo.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Use cases / Industries */}
        <section className="mn-usecases" id="branscher">
          <div className="mn-usecases-inner">
            <h2>Skapa arbetsinstruktioner f&ouml;r alla branscher</h2>
            <p className="mn-usecases-sub">Filma med mobilen, spela in sk&auml;rmen, eller g&ouml;r en manual fr&aring;n en YouTube-l&auml;nk. V&aring;r SOP-generator hanterar allt.</p>
            <div className="mn-usecase-grid">
              <a href="/skapa-manual/tillverkning" className="mn-usecase-card mn-fade-in" aria-label="Skapa manual f&ouml;r tillverkning och verkstad">
                <div className="mn-usecase-anim">
                  <img src="/manualen/mekaniker.svg" alt="Arbetsinstruktioner f&ouml;r verkstad, tillverkning och fordonsunderh&aring;ll" loading="lazy" width="120" height="120" />
                </div>
                <div className="mn-usecase-label">Verkstad &amp; tillverkning</div>
              </a>
              <a href="/skapa-manual/sjukvard" className="mn-usecase-card mn-fade-in" aria-label="Skapa manual f&ouml;r sjukv&aring;rd och medicinteknik">
                <div className="mn-usecase-anim">
                  <img src="/manualen/sjukhustekniker.svg" alt="Procedurmanualer och SOP:er f&ouml;r sjukv&aring;rd och medicinteknik" loading="lazy" width="120" height="120" />
                </div>
                <div className="mn-usecase-label">Sjukv&aring;rd &amp; medicinteknik</div>
              </a>
              <a href="/skapa-manual/livsmedel" className="mn-usecase-card mn-fade-in" aria-label="Skapa manual f&ouml;r k&ouml;k och restaurang">
                <div className="mn-usecase-anim">
                  <img src="/manualen/kock.svg" alt="Standardrutiner f&ouml;r k&ouml;k, restaurang och livsmedelshygien" loading="lazy" width="120" height="120" />
                </div>
                <div className="mn-usecase-label">K&ouml;k &amp; restaurang</div>
              </a>
              <a href="/skapa-manual/bygg" className="mn-usecase-card mn-fade-in" aria-label="Skapa manual f&ouml;r el och installation">
                <div className="mn-usecase-anim">
                  <img src="/manualen/elektriker.svg" alt="Digital manual f&ouml;r el, installation och byggbranschen" loading="lazy" width="120" height="120" />
                </div>
                <div className="mn-usecase-label">El &amp; installation</div>
              </a>
            </div>
            <div className="mn-more-industries mn-fade-in">
              <p>Passa &auml;ven f&ouml;r:
                <a href="/skapa-manual/lager">Lager &amp; logistik</a> &middot;
                <a href="/skapa-manual/it-drift">IT-drift &amp; support</a> &middot;
                <a href="/skapa-manual/onboarding">Onboarding &amp; utbildning</a> &middot;
                <a href="/skapa-manual/underhall">Underh&aring;ll &amp; service</a> &middot;
                <a href="/skapa-manual/sakerhet">S&auml;kerhet &amp; milj&ouml;</a>
              </p>
            </div>
            <div className="mn-source-tags">
              <span className="mn-source-tag">Mobilkamera</span>
              <span className="mn-source-tag">Sk&auml;rminspelning</span>
              <span className="mn-source-tag">YouTube-l&auml;nk</span>
              <span className="mn-source-tag">Valfri videofil</span>
              <span className="mn-source-tag">Instruktionsvideo till manual</span>
            </div>
          </div>
        </section>

        {/* What you get */}
        <section className="mn-result" id="funktioner">
          <div className="mn-result-inner mn-fade-in">
            <div className="mn-result-text">
              <h2>Professionella manualer och arbetsinstruktioner &mdash; automatiskt</h2>
              <ul className="mn-result-list">
                <li>Steg-f&ouml;r-steg-guide med sk&auml;rmbilder fr&aring;n videon</li>
                <li>Verktygs- och materiallistor genererade av AI</li>
                <li>S&auml;kerhetsvarningar och riskbed&ouml;mningar</li>
                <li>Exportera som PDF &mdash; redo att skriva ut och laminera</li>
                <li>Redigera text och bilder innan export</li>
                <li>Standardrutiner anpassade f&ouml;r din bransch</li>
              </ul>
            </div>
            <div className="mn-result-preview">
              <div className="mn-mock-manual" aria-hidden="true">
                <div className="mn-mock-header"></div>
                <div className="mn-mock-step">
                  <div className="mn-mock-img"></div>
                  <div className="mn-mock-lines">
                    <div className="mn-mock-line mn-w80"></div>
                    <div className="mn-mock-line mn-w60"></div>
                  </div>
                </div>
                <div className="mn-mock-step">
                  <div className="mn-mock-img"></div>
                  <div className="mn-mock-lines">
                    <div className="mn-mock-line mn-w70"></div>
                    <div className="mn-mock-line mn-w90"></div>
                  </div>
                </div>
                <div className="mn-mock-step">
                  <div className="mn-mock-img"></div>
                  <div className="mn-mock-lines">
                    <div className="mn-mock-line mn-w85"></div>
                    <div className="mn-mock-line mn-w50"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Keyword-rich content section for SEO crawlability */}
        <section className="mn-seo-content mn-fade-in" id="om-manualen">
          <div className="mn-seo-content-inner">
            <h2>Varf&ouml;r v&auml;lja Manualen.nu som SOP-generator?</h2>
            <div className="mn-seo-columns">
              <div className="mn-seo-col">
                <h3>Fr&aring;n video till f&auml;rdig manual p&aring; minuter</h3>
                <p>
                  Manualen.nu &auml;r en AI-driven SOP-generator som automatiskt skapar professionella
                  manualer, arbetsinstruktioner och standardrutiner fr&aring;n video. Ist&auml;llet f&ouml;r att
                  spendera timmar p&aring; att skriva procedurmanualer f&ouml;r hand beh&ouml;ver du bara filma arbetsprocessen
                  med din mobilkamera. AI:n analyserar videon, identifierar varje steg och genererar en komplett
                  steg-f&ouml;r-steg-guide med bilder.
                </p>
              </div>
              <div className="mn-seo-col">
                <h3>Digitala arbetsinstruktioner f&ouml;r svenska f&ouml;retag</h3>
                <p>
                  Oavsett om du arbetar inom tillverkning, sjukv&aring;rd, logistik eller utbildning &mdash;
                  Manualen.nu f&ouml;rst&aring;r svenska och skapar manualer p&aring; ditt spr&aring;k. V&aring;r AI manual generator
                  hanterar allt fr&aring;n enkel processdokumentation till detaljerade SOP:er med
                  s&auml;kerhetsvarningar och verktygslistor. Omvandla valfri instruktionsvideo till manual
                  och f&ouml;rb&auml;ttra ert arbetsfl&ouml;de direkt.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ section */}
        <section className="mn-faq" id="vanliga-fragor">
          <div className="mn-faq-inner">
            <h2>Vanliga fr&aring;gor om att skapa manualer och SOP:er</h2>
            <div className="mn-faq-list">
              {faqItems.map((item, i) => (
                <div key={i} className={`mn-faq-item mn-fade-in${openFaq === i ? ' mn-faq-open' : ''}`}>
                  <button
                    className="mn-faq-question"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    aria-expanded={openFaq === i}
                    aria-controls={`faq-answer-${i}`}
                  >
                    <span>{item.question}</span>
                    <svg className="mn-faq-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  <div
                    id={`faq-answer-${i}`}
                    className="mn-faq-answer"
                    role="region"
                    aria-labelledby={`faq-q-${i}`}
                  >
                    <p>{item.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mn-cta">
          <div className="mn-cta-inner mn-fade-in">
            <h2>Skapa din f&ouml;rsta manual &mdash; gratis</h2>
            <p>Ladda upp en video och f&aring; en f&auml;rdig steg-f&ouml;r-steg-manual p&aring; n&aring;gra minuter. Ingen registrering kr&auml;vs.</p>
            <button className="mn-btn-primary mn-btn-large" onClick={onGetStarted}>
              Skapa manual fr&aring;n video &mdash; prova gratis
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mn-footer">
        <div className="mn-footer-inner">
          <span className="mn-logo-small">
            <img src="/manualen/logo.png" alt="Manualen.nu &mdash; AI SOP-generator f&ouml;r svenska f&ouml;retag" className="mn-logo-icon-small" loading="lazy" />
            manualen<span>.nu</span>
          </span>
          <nav className="mn-footer-links" aria-label="Sidfot">
            <a href="#sa-funkar-det">S&aring; funkar det</a>
            <a href="#branscher">Branscher</a>
            <a href="#funktioner">Funktioner</a>
            <a href="#vanliga-fragor">Vanliga fr&aring;gor</a>
            <a href="https://www.frameops.ai/" rel="noopener" hrefLang="en">English (FrameOps)</a>
          </nav>
          <span className="mn-footer-copy">&copy; 2026 Manualen.nu</span>
        </div>
      </footer>
    </div>
  );
};

export default ManualenLandingPage;
