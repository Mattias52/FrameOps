import React, { useEffect } from 'react';
import { AppView } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

interface CreatorLandingPageProps {
  onGetStarted: () => void;
  onNavigate: (view: AppView) => void;
}

const CreatorLandingPage: React.FC<CreatorLandingPageProps> = ({ onGetStarted, onNavigate }) => {
  const { user, loading, signInGoogle } = useAuth();
  const { t } = useTranslation();

  // Auto-enter app when user is logged in (e.g., after OAuth redirect)
  useEffect(() => {
    if (!loading && user) {
      console.log('User logged in, auto-entering app');
      onGetStarted();
    }
  }, [user, loading, onGetStarted]);

  // SEO for creator page
  useEffect(() => {
    document.title = 'FrameOps for Creators - Turn Your Videos Into Downloadable Guides';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Give your followers more than just videos. Turn your YouTube tutorials into professional step-by-step guides they can download and follow. Free, takes minutes.');
    }
  }, []);

  const useCases = [
    {
      icon: "fa-hammer",
      title: t('creator.diyMakers'),
      description: t('creator.diyMakersDesc'),
      example: t('creator.diyMakersExample')
    },
    {
      icon: "fa-dumbbell",
      title: t('creator.fitnessHealth'),
      description: t('creator.fitnessHealthDesc'),
      example: t('creator.fitnessHealthExample')
    },
    {
      icon: "fa-utensils",
      title: t('creator.cookingRecipes'),
      description: t('creator.cookingRecipesDesc'),
      example: t('creator.cookingRecipesExample')
    },
    {
      icon: "fa-paint-brush",
      title: t('creator.beautyTutorials'),
      description: t('creator.beautyTutorialsDesc'),
      example: t('creator.beautyTutorialsExample')
    },
    {
      icon: "fa-laptop-code",
      title: t('creator.techSetup'),
      description: t('creator.techSetupDesc'),
      example: t('creator.techSetupExample')
    },
    {
      icon: "fa-seedling",
      title: t('creator.gardeningHome'),
      description: t('creator.gardeningHomeDesc'),
      example: t('creator.gardeningHomeExample')
    }
  ];

  const benefits = [
    {
      icon: "fa-dollar-sign",
      title: t('creator.newRevenueStream'),
      description: t('creator.newRevenueStreamDesc')
    },
    {
      icon: "fa-heart",
      title: t('creator.deeperFanConnection'),
      description: t('creator.deeperFanConnectionDesc')
    },
    {
      icon: "fa-clock",
      title: t('creator.zeroExtraWork'),
      description: t('creator.zeroExtraWorkDesc')
    },
    {
      icon: "fa-infinity",
      title: t('creator.passiveIncome'),
      description: t('creator.passiveIncomeDesc')
    }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-slate-950/90 backdrop-blur-md z-50 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => onNavigate(AppView.LANDING)}
            >
              <div className="w-16 h-16 rounded-xl flex items-center justify-center">
                <img src="/logo.png" alt="FrameOps" className="w-16 h-16" />
              </div>
              <span className="font-bold text-xl">FrameOps</span>
              <span className="px-2 py-0.5 bg-amber-500 text-slate-900 text-[10px] font-bold rounded-full uppercase">
                {t('creator.forCreators')}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {user ? (
                <button
                  onClick={onGetStarted}
                  className="px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors"
                >
                  {t('creator.goToDashboard')}
                </button>
              ) : (
                <>
                  <button
                    onClick={signInGoogle}
                    className="hidden sm:flex items-center gap-2 px-4 py-2.5 text-white/80 font-medium hover:text-white"
                  >
                    <i className="fab fa-google"></i>
                    {t('creator.signIn')}
                  </button>
                  <button
                    onClick={onGetStarted}
                    className="px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors"
                  >
                    {t('creator.getFreeAccess')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-full text-amber-400 text-sm font-medium mb-8">
            <i className="fas fa-handshake"></i>
            <span>{t('creator.creatorPartnershipProgram')}</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight mb-6">
            {t('creator.heroTitle1')}
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
              {t('creator.heroTitle2')}
            </span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10" dangerouslySetInnerHTML={{ __html: t('creator.heroDesc') }} />

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto px-8 py-4 bg-amber-500 text-slate-900 rounded-2xl font-bold text-lg hover:bg-amber-400 transition-all shadow-xl shadow-amber-500/20"
            >
              <i className="fab fa-youtube mr-2"></i>
              {t('creator.useYoutubeVideo')}
            </button>
            <button
              onClick={() => onNavigate(AppView.LIVE_GENERATOR)}
              className="w-full sm:w-auto px-8 py-4 bg-emerald-500 text-white rounded-2xl font-bold text-lg hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-500/20"
            >
              <i className="fas fa-video mr-2"></i>
              {t('creator.recordLive')}
            </button>
          </div>

          {/* Quick Demo */}
          <div className="relative max-w-4xl mx-auto">
            <div className="bg-slate-900 rounded-3xl border border-slate-800 p-8 shadow-2xl">
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-slate-800 rounded-xl">
                  <i className="fab fa-youtube text-red-500 text-xl"></i>
                  <span className="text-slate-400 text-sm">https://youtube.com/watch?v=your-video</span>
                </div>
                <button className="px-6 py-3 bg-amber-500 text-slate-900 rounded-xl font-bold">
                  {t('creator.generateSop')}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="aspect-video bg-slate-800 rounded-xl flex items-center justify-center">
                  <i className="fas fa-image text-slate-600 text-2xl"></i>
                </div>
                <div className="aspect-video bg-slate-800 rounded-xl flex items-center justify-center">
                  <i className="fas fa-image text-slate-600 text-2xl"></i>
                </div>
                <div className="aspect-video bg-slate-800 rounded-xl flex items-center justify-center">
                  <i className="fas fa-image text-slate-600 text-2xl"></i>
                </div>
              </div>
              <p className="text-center text-slate-500 text-sm mt-4">
                {t('creator.aiExtractsFrames')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            {t('creator.whyCreatorsLove')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, i) => (
              <div key={i} className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700">
                <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center mb-4">
                  <i className={`fas ${benefit.icon} text-amber-400 text-xl`}></i>
                </div>
                <h3 className="font-bold text-lg mb-2">{benefit.title}</h3>
                <p className="text-slate-400 text-sm">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section id="use-cases" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">{t('creator.perfectForNiche')}</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              {t('creator.nicheDesc')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {useCases.map((useCase, i) => (
              <div key={i} className="p-6 bg-slate-900 rounded-2xl border border-slate-800 hover:border-amber-500/50 transition-colors group">
                <div className="w-12 h-12 bg-slate-800 group-hover:bg-amber-500/20 rounded-xl flex items-center justify-center mb-4 transition-colors">
                  <i className={`fas ${useCase.icon} text-slate-400 group-hover:text-amber-400 text-xl transition-colors`}></i>
                </div>
                <h3 className="font-bold text-lg mb-2">{useCase.title}</h3>
                <p className="text-slate-400 text-sm mb-4">{useCase.description}</p>
                <div className="px-3 py-2 bg-slate-800 rounded-lg">
                  <p className="text-xs text-amber-400 font-medium">{useCase.example}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            {t('creator.fromYoutubeToGuide')}
          </h2>
          <div className="space-y-8">
            {[
              {
                step: "1",
                title: t('creator.step1Title'),
                description: t('creator.step1Desc'),
                icon: "fa-link"
              },
              {
                step: "2",
                title: t('creator.step2Title'),
                description: t('creator.step2Desc'),
                icon: "fa-magic"
              },
              {
                step: "3",
                title: t('creator.step3Title'),
                description: t('creator.step3Desc'),
                icon: "fa-dollar-sign"
              }
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-6">
                <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-slate-900">{item.step}</span>
                </div>
                <div className="flex-1 pt-2">
                  <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                  <p className="text-slate-400">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live SOP Recording */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Phone Mockup */}
            <div className="relative flex justify-center">
              <div className="relative w-72 h-[500px] bg-slate-800 rounded-[3rem] border-4 border-slate-700 shadow-2xl overflow-hidden">
                {/* Phone Screen */}
                <div className="absolute inset-3 bg-slate-900 rounded-[2.5rem] overflow-hidden">
                  {/* Status Bar */}
                  <div className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-red-500 rounded-full text-white text-xs font-bold flex items-center gap-1">
                        <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                        REC 02:34
                      </span>
                    </div>
                    <div className="px-3 py-1 bg-emerald-500 rounded-full text-white text-xs font-medium flex items-center gap-1">
                      <i className="fas fa-microphone text-[10px]"></i>
                      Listening...
                    </div>
                  </div>

                  {/* Camera View Placeholder */}
                  <div className="flex-1 flex items-center justify-center h-64">
                    <i className="fas fa-hand-paper text-slate-700 text-6xl"></i>
                  </div>

                  {/* Step Detection Popup */}
                  <div className="absolute bottom-32 left-1/2 -translate-x-1/2 px-4 py-3 bg-white rounded-xl shadow-xl">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold">3</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Step detected</p>
                        <p className="text-xs text-slate-500">"Apply the first coat..."</p>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Stats */}
                  <div className="absolute bottom-6 left-0 right-0 px-6">
                    <div className="flex items-center justify-between text-slate-400 text-sm">
                      <span>Steps captured</span>
                      <span className="font-bold text-white">7</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-sm font-medium mb-6">
                <i className="fas fa-bolt"></i>
                <span>{t('creator.perfectForTutorials')}</span>
              </div>

              <h2 className="text-4xl font-bold mb-6">
                {t('creator.orRecordLive')}
              </h2>

              <p className="text-slate-400 text-lg mb-8">
                {t('creator.orRecordLiveDesc')}
              </p>

              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-video text-white"></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1">{t('creator.justFilmYourself')}</h3>
                    <p className="text-slate-400">{t('creator.justFilmYourselfDesc')}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-microphone text-white"></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1">{t('creator.talkWhileYouWork')}</h3>
                    <p className="text-slate-400">{t('creator.talkWhileYouWorkDesc')}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-wand-magic-sparkles text-white"></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1">{t('creator.getCompleteSop')}</h3>
                    <p className="text-slate-400">{t('creator.getCompleteSopDesc')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-rose-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-list-check text-white"></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg mb-1">{t('creator.aiStepPlanner')}</h3>
                    <p className="text-slate-400">{t('creator.aiStepPlannerDesc')}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => onNavigate(AppView.LIVE_GENERATOR)}
                className="mt-8 px-8 py-4 bg-emerald-500 text-white rounded-2xl font-bold text-lg hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-500/20"
              >
                <i className="fas fa-video mr-2"></i>
                {t('creator.tryLiveRecording')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA - Creator Partnership */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-full text-amber-400 text-sm font-medium mb-6">
            <i className="fas fa-handshake"></i>
            <span>{t('creator.creatorPartnershipProgram')}</span>
          </div>
          <h2 className="text-4xl font-bold mb-6">
            {t('creator.partnerWithUs')}
          </h2>
          <p className="text-slate-400 text-lg mb-8">
            {t('creator.partnerDesc')}
          </p>
          <div className="bg-slate-800/50 rounded-2xl p-6 mb-8 border border-slate-700">
            <h3 className="font-bold mb-4">{t('creator.whatPartnersGet')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              {[t('creator.perk1'), t('creator.perk2'), t('creator.perk3'), t('creator.perk4'), t('creator.perk5'), t('creator.perk6')].map((perk, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <i className="fas fa-check text-amber-400"></i>
                  <span className="text-slate-300">{perk}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onGetStarted}
              className="px-10 py-4 bg-amber-500 text-slate-900 rounded-2xl font-bold text-lg hover:bg-amber-400 transition-all shadow-xl shadow-amber-500/20"
            >
              <i className="fas fa-rocket mr-2"></i>
              {t('creator.tryFrameOpsFree')}
            </button>
            <a
              href="mailto:partners@frameops.ai?subject=Creator Partnership"
              className="px-10 py-4 bg-slate-700 text-white rounded-2xl font-bold text-lg hover:bg-slate-600 transition-all"
            >
              <i className="fas fa-envelope mr-2"></i>
              {t('creator.applyForPartnership')}
            </a>
          </div>
          <p className="text-slate-500 text-sm mt-4">
            {t('creator.alreadyHaveAudience')}
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-14 h-14 rounded-lg flex items-center justify-center">
              <img src="/logo.png" alt="FrameOps" className="w-14 h-14" />
            </div>
            <span className="font-bold">FrameOps</span>
          </div>
          <div className="flex items-center gap-6 text-slate-400 text-sm">
            <button onClick={() => onNavigate(AppView.PRIVACY)} className="hover:text-white transition-colors">{t('creator.privacyPolicy')}</button>
            <button onClick={() => onNavigate(AppView.TERMS)} className="hover:text-white transition-colors">{t('creator.termsOfService')}</button>
            <a href="mailto:support@frameops.ai" className="hover:text-white transition-colors">{t('creator.contact')}</a>
          </div>
          <p className="text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} FrameOps. {t('creator.madeForCreators')}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default CreatorLandingPage;
