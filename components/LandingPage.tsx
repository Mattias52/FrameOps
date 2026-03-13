import React, { useEffect } from 'react';
import { AppView } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

interface LandingPageProps {
  onNavigate: (view: AppView) => void;
  onGetStarted: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, onGetStarted }) => {
  const { user, loading, signInGoogle } = useAuth();
  const { t } = useTranslation();

  // Auto-enter app when user is logged in (e.g., after OAuth redirect)
  useEffect(() => {
    if (!loading && user) {
      console.log('User logged in, auto-entering app');
      onGetStarted();
    }
  }, [user, loading, onGetStarted]);

  const features = [
    {
      icon: 'fa-youtube',
      title: t('landing.youtubeImport'),
      description: t('landing.youtubeImportDesc'),
      isBrand: true
    },
    {
      icon: 'fa-mobile-screen',
      title: t('landing.liveRecordingTitle'),
      description: t('landing.liveRecordingDesc')
    },
    {
      icon: 'fa-desktop',
      title: t('landing.screenRecordingTitle'),
      description: t('landing.screenRecordingDesc')
    },
    {
      icon: 'fa-cloud-upload-alt',
      title: t('landing.videoUploadTitle'),
      description: t('landing.videoUploadDesc')
    },
    {
      icon: 'fa-shield-halved',
      title: t('landing.safetyDetection'),
      description: t('landing.safetyDetectionDesc')
    },
    {
      icon: 'fa-file-pdf',
      title: t('landing.pdfExportTitle'),
      description: t('landing.pdfExportDesc')
    },
    {
      icon: 'fa-images',
      title: t('landing.frameSelectionTitle'),
      description: t('landing.frameSelectionDesc')
    }
  ];

  const useCases = [
    { industry: t('landing.manufacturing'), example: t('landing.manufacturingExample'), icon: 'fa-industry', view: AppView.MANUFACTURING },
    { industry: t('landing.healthcare'), example: t('landing.healthcareExample'), icon: 'fa-hospital', view: AppView.HEALTHCARE },
    { industry: t('landing.foodService'), example: t('landing.foodServiceExample'), icon: 'fa-utensils', view: null },
    { industry: t('landing.trainingHr'), example: t('landing.trainingHrExample'), icon: 'fa-graduation-cap', view: AppView.TRAINING },
  ];

  const pricing = [
    {
      name: t('landing.betaFreePriceName'),
      price: '0',
      period: '',
      description: t('landing.betaFreePriceDesc'),
      features: [
        t('landing.betaFreePriceFeature1'),
        t('landing.betaFreePriceFeature2'),
        t('landing.betaFreePriceFeature3'),
        t('landing.betaFreePriceFeature4'),
        t('landing.betaFreePriceFeature5'),
        t('landing.betaFreePriceFeature6')
      ],
      cta: t('landing.getStartedFree'),
      highlighted: true
    },
    {
      name: t('landing.proPriceName'),
      price: '19',
      period: t('landing.perMonth'),
      description: t('landing.proPriceDesc'),
      features: [
        t('landing.proPriceFeature1'),
        t('landing.proPriceFeature2'),
        t('landing.proPriceFeature3'),
        t('landing.proPriceFeature4')
      ],
      cta: t('landing.comingAfterBeta'),
      highlighted: false
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl flex items-center justify-center">
                <img src="/logo.png" alt="FrameOps" className="w-16 h-16" />
              </div>
              <span className="font-bold text-xl text-slate-900">FrameOps</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-slate-600 hover:text-slate-900 font-medium">{t('landing.features')}</a>
              <a href="#pricing" className="text-slate-600 hover:text-slate-900 font-medium">{t('landing.pricing')}</a>
              <button
                onClick={() => onNavigate(AppView.CREATOR_LANDING)}
                className="text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1"
              >
                <i className="fab fa-youtube text-sm"></i>
                {t('landing.forCreators')}
              </button>
            </div>
            <div className="flex items-center gap-3">
              {user ? (
                <button
                  onClick={onGetStarted}
                  className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                >
                  {t('landing.goToDashboard')}
                </button>
              ) : (
                <>
                  <button
                    onClick={signInGoogle}
                    className="hidden sm:flex items-center gap-2 px-4 py-2.5 text-slate-700 font-medium hover:text-slate-900"
                  >
                    <i className="fas fa-user"></i>
                    {t('landing.signIn')}
                  </button>
                  <button
                    onClick={onGetStarted}
                    className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                  >
                    {t('landing.getStartedFree')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Beta Banner */}
      <div className="fixed top-16 left-0 right-0 bg-slate-800 text-white py-2 px-4 text-center z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 text-sm">
          <span>
            {t('landing.betaBanner')}
          </span>
        </div>
      </div>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="flex-1 max-w-2xl">

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 leading-tight mb-8">
                {t('landing.heroTitle')}
              </h1>

              <p className="text-xl text-slate-600 mb-4 leading-relaxed">
                {t('landing.heroP1')}
              </p>

              <p className="text-xl text-slate-600 mb-4 leading-relaxed">
                {t('landing.heroP2')}
              </p>

              <p className="text-xl text-slate-900 font-semibold mb-10">
                {t('landing.heroP3')}
              </p>

              <div className="flex flex-col sm:flex-row items-start gap-4 mb-6">
                <button
                  onClick={onGetStarted}
                  className="w-full sm:w-auto px-8 py-4 bg-slate-900 text-white rounded-xl font-bold text-lg hover:bg-slate-800 transition-all"
                >
                  {t('landing.tryItFree')}
                </button>
              </div>

              <p className="text-slate-500">
                {t('landing.heroSubtext')}
              </p>

            </div>
            <div className="flex-1 max-w-lg">
              <img
                src="/manualen/hero.png"
                alt="Field service engineer documenting a repair with a phone camera"
                className="w-full h-auto rounded-2xl shadow-xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-slate-600">
            {t('landing.whoItsFor')}
          </p>
          <p className="text-slate-500 text-sm mt-2">
            {t('landing.whoItsForSub')}
          </p>
        </div>
      </section>

      {/* Live SOP Feature Highlight */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900 text-white scroll-mt-24">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">
                {t('landing.easyWay')}
              </h2>
              <p className="text-lg text-slate-400 max-w-2xl mx-auto">
                {t('landing.easyWaySub')}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Visual Demo */}
              <div className="relative">
                <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700">
                  {/* Phone mockup */}
                  <div className="bg-black rounded-2xl p-3 max-w-[280px] mx-auto">
                    <div className="bg-slate-900 rounded-xl aspect-[9/16] flex flex-col">
                      {/* Camera view */}
                      <div className="flex-1 bg-gradient-to-b from-slate-800 to-slate-900 rounded-t-xl relative overflow-hidden">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <i className="fas fa-hands text-slate-700 text-6xl"></i>
                        </div>
                        {/* Recording indicator */}
                        <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600 px-2 py-1 rounded-full">
                          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                          <span className="text-white text-xs font-bold">REC 02:34</span>
                        </div>
                        {/* Listening indicator */}
                        <div className="absolute top-3 right-3 flex items-center gap-2 bg-emerald-600 px-2 py-1 rounded-full">
                          <i className="fas fa-microphone text-white text-xs"></i>
                          <span className="text-white text-xs">Listening...</span>
                        </div>
                      </div>
                      {/* Steps counter */}
                      <div className="p-3 bg-slate-800 rounded-b-xl">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-400">{t('landing.stepsCaptured')}</span>
                          <span className="text-white font-bold">7</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Floating step cards */}
                <div className="absolute -right-4 top-1/4 bg-white rounded-xl p-3 shadow-xl max-w-[200px] animate-pulse">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">3</div>
                    <span className="text-slate-900 text-sm font-semibold">{t('landing.stepDetected')}</span>
                  </div>
                  <p className="text-slate-600 text-xs">"Tighten the bolt to 25 Nm..."</p>
                </div>
              </div>

              {/* Benefits */}
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-video text-white text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">{t('landing.justRecordYourself')}</h3>
                    <p className="text-slate-400">{t('landing.justRecordYourselfDesc')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-microphone text-white text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">{t('landing.talkWhileYouWork')}</h3>
                    <p className="text-slate-400">{t('landing.talkWhileYouWorkDesc')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-wand-magic-sparkles text-white text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">{t('landing.aiDoesTheRest')}</h3>
                    <p className="text-slate-400">{t('landing.aiDoesTheRestDesc')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-rose-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-list-check text-white text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">{t('landing.aiStepPlanner')}</h3>
                    <p className="text-slate-400">{t('landing.aiStepPlannerDesc')}</p>
                  </div>
                </div>
                <button
                  onClick={onGetStarted}
                  className="w-full sm:w-auto px-8 py-4 bg-amber-500 text-slate-900 rounded-2xl font-bold text-lg hover:bg-amber-400 transition-all mt-4"
                >
                  <i className="fas fa-play mr-2"></i>
                  {t('landing.tryLiveRecording')}
                </button>
              </div>
            </div>
          </div>
        </section>


      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 scroll-mt-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">{t('landing.howItWorks')}</h2>
            <p className="text-lg text-slate-600 max-w-xl mx-auto">
              {t('landing.howItWorksSub')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <div key={i} className="p-8 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <div className={`w-14 h-14 ${feature.isBrand ? 'bg-red-100' : 'bg-indigo-100'} rounded-2xl flex items-center justify-center mb-6`}>
                  <i className={`${feature.isBrand ? 'fab' : 'fas'} ${feature.icon} text-2xl ${feature.isBrand ? 'text-red-600' : 'text-indigo-600'}`}></i>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 scroll-mt-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">{t('landing.pricingTitle')}</h2>
            <p className="text-lg text-slate-600 max-w-xl mx-auto">
              {t('landing.pricingSub')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {pricing.map((plan, i) => (
              <div
                key={i}
                className={`relative p-6 rounded-2xl flex flex-col ${
                  plan.highlighted
                    ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 scale-105 z-10'
                    : 'bg-white border border-slate-200'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-amber-400 text-amber-900 text-xs font-bold rounded-full">
                    {t('landing.mostPopular')}
                  </div>
                )}
                <h3 className={`text-xl font-bold mb-1 ${plan.highlighted ? 'text-white' : 'text-slate-900'}`}>
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className={`text-4xl font-extrabold ${plan.highlighted ? 'text-white' : 'text-slate-900'}`}>
                    {plan.price === 'Custom' ? '' : '$'}{plan.price}
                  </span>
                  {plan.period && (
                    <span className={plan.highlighted ? 'text-indigo-200' : 'text-slate-600'}>
                      {plan.period}
                    </span>
                  )}
                </div>
                <p className={`text-sm mb-6 ${plan.highlighted ? 'text-indigo-200' : 'text-slate-600'}`}>
                  {plan.description}
                </p>
                <ul className="space-y-3 mb-6 flex-1">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <i className={`fas fa-check mt-0.5 ${plan.highlighted ? 'text-indigo-300' : 'text-indigo-500'}`}></i>
                      <span className={plan.highlighted ? 'text-white' : 'text-slate-700'}>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={plan.name === 'Enterprise' ? undefined : onGetStarted}
                  className={`w-full py-3 rounded-xl font-semibold transition-colors ${
                    plan.highlighted
                      ? 'bg-white text-indigo-600 hover:bg-indigo-50'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-900">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            {t('landing.ctaTitle')}
          </h2>
          <p className="text-lg text-slate-400 mb-8">
            {t('landing.ctaSub')}
          </p>
          <button
            onClick={onGetStarted}
            className="px-8 py-4 bg-white text-slate-900 rounded-xl font-bold text-lg hover:bg-slate-100 transition-colors"
          >
            {t('landing.tryItFree')}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-slate-950">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-lg flex items-center justify-center">
                <img src="/logo.png" alt="FrameOps" className="w-14 h-14" />
              </div>
              <span className="font-bold text-white">FrameOps</span>
            </div>
            <div className="flex items-center gap-6 text-slate-400 text-sm">
              <button onClick={() => onNavigate(AppView.PRIVACY)} className="hover:text-white transition-colors">{t('landing.privacyPolicy')}</button>
              <button onClick={() => onNavigate(AppView.TERMS)} className="hover:text-white transition-colors">{t('landing.termsOfService')}</button>
              <a href="mailto:support@frameops.ai" className="hover:text-white transition-colors">{t('landing.contact')}</a>
            </div>
            <p className="text-slate-600 text-sm">
              &copy; {new Date().getFullYear()} FrameOps. {t('landing.allRightsReserved')}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
