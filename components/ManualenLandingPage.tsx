import React, { useEffect, useRef } from 'react';
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

  // Auto-enter app when user is logged in
  useEffect(() => {
    if (!loading && user) {
      onGetStarted();
    }
  }, [user, loading, onGetStarted]);

  // SEO
  useEffect(() => {
    document.title = 'Manualen.nu — Filma jobbet. Få en manual.';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Filma ditt arbete, få en färdig manual automatiskt. Perfekt för mekaniker, tekniker, kockar och alla som behöver dokumentera processer.');
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

  return (
    <div className="manualen-page" ref={pageRef}>
      {/* Nav */}
      <nav className="mn-nav">
        <div className="mn-nav-inner">
          <button className="mn-logo" onClick={() => onNavigate(AppView.LANDING)}>
            <img src="/manualen/logo.png" alt="Manualen.nu" className="mn-logo-icon" />
            manualen<span>.nu</span>
          </button>
          <button className="mn-nav-cta" onClick={onGetStarted}>Testa gratis</button>
        </div>
      </nav>

      {/* Hero */}
      <section className="mn-hero">
        <div className="mn-hero-content">
          <p className="mn-hero-tag">Sluta skriva manualer</p>
          <h1>Filma jobbet.<br />Manualen skriver sig själv.</h1>
          <p className="mn-hero-sub">
            Du filmar med mobilen medan du jobbar. AI:n tittar, lyssnar och skapar en komplett
            steg-för-steg-manual med bilder — automatiskt.
          </p>
          <div className="mn-hero-actions">
            <button className="mn-btn-primary" onClick={onGetStarted}>Prova gratis</button>
            <span className="mn-hero-note">Ingen registrering krävs</span>
          </div>
        </div>
        <div className="mn-hero-image">
          <img src="/manualen/hero.png" alt="Tekniker filmar sitt arbete med mobilen medan han jobbar" />
        </div>
      </section>

      {/* Social proof bar */}
      <section className="mn-proof-bar">
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
            <span>AI:n förstår svenska</span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mn-how">
        <div className="mn-how-inner">
          <h2>Så funkar det</h2>
          <div className="mn-how-steps">
            <div className="mn-how-step mn-fade-in">
              <div className="mn-how-num">1</div>
              <h3>Filma</h3>
              <p>Ställ mobilen mot väggen eller be en kollega hålla. Filma som vanligt medan du jobbar.</p>
            </div>
            <div className="mn-how-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </div>
            <div className="mn-how-step mn-fade-in">
              <div className="mn-how-num">2</div>
              <h3>Ladda upp</h3>
              <p>Dra in videon på sidan. AI:n analyserar bild och ljud och plockar ut varje steg.</p>
            </div>
            <div className="mn-how-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </div>
            <div className="mn-how-step mn-fade-in">
              <div className="mn-how-num">3</div>
              <h3>Klar</h3>
              <p>Redigera om du vill. Exportera som PDF. Skriv ut, laminera, dela med teamet.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="mn-usecases">
        <div className="mn-usecases-inner">
          <h2>Funkar med vilken video som helst</h2>
          <p className="mn-usecases-sub">Filma med mobilen, spela in skärmen, eller klistra in en YouTube-länk.</p>
          <div className="mn-usecase-grid">
            <div className="mn-usecase-card mn-fade-in">
              <div className="mn-usecase-anim">
                <img src="/manualen/mekaniker.svg" alt="Mekaniker" />
              </div>
              <div className="mn-usecase-label">Verkstad & fordon</div>
            </div>
            <div className="mn-usecase-card mn-fade-in">
              <div className="mn-usecase-anim">
                <img src="/manualen/sjukhustekniker.svg" alt="Sjukhustekniker" />
              </div>
              <div className="mn-usecase-label">Sjukvård & medicinteknik</div>
            </div>
            <div className="mn-usecase-card mn-fade-in">
              <div className="mn-usecase-anim">
                <img src="/manualen/kock.svg" alt="Kock" />
              </div>
              <div className="mn-usecase-label">Kök & restaurang</div>
            </div>
            <div className="mn-usecase-card mn-fade-in">
              <div className="mn-usecase-anim">
                <img src="/manualen/elektriker.svg" alt="Elektriker" />
              </div>
              <div className="mn-usecase-label">El & installation</div>
            </div>
          </div>
          <div className="mn-source-tags">
            <span className="mn-source-tag">Mobilkamera</span>
            <span className="mn-source-tag">Skärminspelning</span>
            <span className="mn-source-tag">YouTube-länk</span>
            <span className="mn-source-tag">Valfri videofil</span>
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="mn-result">
        <div className="mn-result-inner mn-fade-in">
          <div className="mn-result-text">
            <h2>Det här får du</h2>
            <ul className="mn-result-list">
              <li>Steg-för-steg med skärmdumpar från videon</li>
              <li>Verktygs- och materiallistor</li>
              <li>Varningar och säkerhetsinformation</li>
              <li>Exportera som PDF — redo att skriva ut</li>
              <li>Redigera text och bilder innan export</li>
            </ul>
          </div>
          <div className="mn-result-preview">
            <div className="mn-mock-manual">
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

      {/* CTA */}
      <section className="mn-cta">
        <div className="mn-cta-inner mn-fade-in">
          <h2>Testa med din egen video</h2>
          <p>Ladda upp en video och se resultatet direkt. Gratis, utan konto.</p>
          <button className="mn-btn-primary mn-btn-large" onClick={onGetStarted}>
            Skapa din första manual
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="mn-footer">
        <div className="mn-footer-inner">
          <span className="mn-logo-small">
            <img src="/manualen/logo.png" alt="Manualen.nu" className="mn-logo-icon-small" />
            manualen<span>.nu</span>
          </span>
          <span className="mn-footer-copy">&copy; 2026</span>
        </div>
      </footer>
    </div>
  );
};

export default ManualenLandingPage;
