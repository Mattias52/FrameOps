import React, { useState } from 'react';
import { AppView } from '../types';

interface LandingPageProps {
  onNavigate: (view: AppView) => void;
  onGetStarted: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onNavigate, onGetStarted }) => {
  const [audience, setAudience] = useState<'business' | 'creator'>('business');

  const businessFeatures = [
    {
      icon: 'fa-mobile-screen',
      title: 'Live Recording',
      description: 'Record yourself doing the task with your phone. AI watches and creates the SOP as you work.',
      highlight: true
    },
    {
      icon: 'fa-microphone',
      title: 'Voice Instructions',
      description: 'Just talk while you work. AI transcribes your voice and turns it into professional written steps.'
    },
    {
      icon: 'fa-youtube',
      title: 'YouTube Import',
      description: 'Paste any YouTube URL. Perfect for turning existing training videos into documentation.'
    },
    {
      icon: 'fa-shield-halved',
      title: 'Safety Detection',
      description: 'AI automatically identifies hazards and suggests PPE requirements from your footage.'
    },
    {
      icon: 'fa-file-pdf',
      title: 'PDF Export',
      description: 'One-click export to professional PDF ready for print or digital distribution.'
    },
    {
      icon: 'fa-clock',
      title: '10 Minutes',
      description: 'What took 4-8 hours of manual documentation now takes under 10 minutes.'
    }
  ];

  const creatorFeatures = [
    {
      icon: 'fa-youtube',
      title: 'YouTube Integration',
      description: 'Paste any YouTube link and instantly transform tutorials into step-by-step guides.'
    },
    {
      icon: 'fa-wand-magic-sparkles',
      title: 'AI Transcription',
      description: 'Automatic audio transcription ensures every spoken detail is captured in your guides.'
    },
    {
      icon: 'fa-book-open',
      title: 'Course Materials',
      description: 'Turn video content into downloadable PDFs, course handouts, and reference guides.'
    },
    {
      icon: 'fa-palette',
      title: 'Custom Branding',
      description: 'Add your logo, colors, and style to create professional branded documentation.'
    },
    {
      icon: 'fa-bolt',
      title: 'Instant Guides',
      description: 'Create companion guides for your videos in minutes, not hours.'
    },
    {
      icon: 'fa-chart-line',
      title: 'Grow Your Audience',
      description: 'Offer downloadable guides as lead magnets or premium content.'
    }
  ];

  const features = audience === 'business' ? businessFeatures : creatorFeatures;

  const businessUseCases = [
    { industry: 'Manufacturing', example: 'Machine setup, maintenance procedures, quality checks', icon: 'fa-industry' },
    { industry: 'Healthcare', example: 'Clinical procedures, equipment operation, sterilization', icon: 'fa-hospital' },
    { industry: 'Food Service', example: 'Health code compliance, recipes, cleaning procedures', icon: 'fa-utensils' },
    { industry: 'Training & HR', example: 'Onboarding, safety training, compliance documentation', icon: 'fa-graduation-cap' },
  ];

  const creatorUseCases = [
    { industry: 'Tech Tutorials', example: 'Software walkthroughs, coding guides, app tutorials', icon: 'fa-code' },
    { industry: 'DIY & Crafts', example: 'Project instructions, material lists, step-by-step crafts', icon: 'fa-hammer' },
    { industry: 'Online Courses', example: 'Course handouts, lesson summaries, student guides', icon: 'fa-chalkboard-teacher' },
    { industry: 'How-To Content', example: 'Recipe cards, repair guides, installation manuals', icon: 'fa-lightbulb' },
  ];

  const useCases = audience === 'business' ? businessUseCases : creatorUseCases;

  const pricing = [
    {
      name: 'Free',
      price: '0',
      period: '/forever',
      description: 'Preview any video before you buy',
      features: ['Unlimited previews', 'See first 3 steps of any SOP', 'Test with your own videos', 'No credit card required'],
      cta: 'Try Free Preview',
      highlighted: false
    },
    {
      name: 'Pro',
      price: '19',
      period: '/month',
      description: 'For professionals and small teams',
      features: ['Unlimited SOPs', 'HD frame extraction', 'No watermark on exports', 'Priority AI processing', 'Custom branding'],
      cta: 'Start Free Trial',
      highlighted: true
    },
    {
      name: 'Team',
      price: '49',
      period: '/month',
      description: 'Collaboration for growing teams',
      features: ['Everything in Pro', '5 team members', 'Shared SOP library', 'Team branding', 'Analytics dashboard'],
      cta: 'Start Free Trial',
      highlighted: false
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      description: 'For large organizations',
      features: ['Unlimited team members', 'SSO integration', 'API access', 'Dedicated support', 'On-premise option'],
      cta: 'Contact Sales',
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
              <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
                <i className="fas fa-film text-white text-lg"></i>
              </div>
              <span className="font-bold text-xl text-slate-900">FrameOps</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-slate-600 hover:text-slate-900 font-medium">Features</a>
              <a href="#pricing" className="text-slate-600 hover:text-slate-900 font-medium">Pricing</a>
              <button
                onClick={() => onNavigate(AppView.CREATOR_LANDING)}
                className="text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1"
              >
                <i className="fab fa-youtube text-sm"></i>
                For Creators
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onGetStarted}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
              >
                Get Started Free
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Beta Banner */}
      <div className="fixed top-16 left-0 right-0 bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-2.5 px-4 text-center z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-3 text-sm">
          <i className="fas fa-flask"></i>
          <span className="font-medium">
            🚀 We're in beta! Get <strong>free access</strong> and help shape the future of SOP creation.
          </span>
          <button
            onClick={onGetStarted}
            className="ml-2 px-4 py-1 bg-white/20 hover:bg-white/30 rounded-full font-semibold transition-colors"
          >
            Join Beta
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            {/* Audience Toggle */}
            <div className="inline-flex items-center bg-slate-100 rounded-full p-1 mb-8">
              <button
                onClick={() => setAudience('business')}
                className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  audience === 'business'
                    ? 'bg-white text-slate-900 shadow-md'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <i className="fas fa-building mr-2"></i>
                For Business
              </button>
              <button
                onClick={() => setAudience('creator')}
                className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  audience === 'creator'
                    ? 'bg-white text-slate-900 shadow-md'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <i className="fas fa-video mr-2"></i>
                For Creators
              </button>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-full text-sm font-semibold mb-6">
              <i className="fas fa-sparkles"></i>
              Powered by Google Gemini AI
            </div>

            {audience === 'business' ? (
              <>
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-slate-900 leading-tight mb-6">
                  Turn Videos Into <br />
                  <span className="text-indigo-600">Professional SOPs</span>
                </h1>
                <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
                  <strong className="text-slate-900">Record live</strong> with your phone, <strong className="text-slate-900">upload a video</strong>, or <strong className="text-slate-900">paste a YouTube link</strong> — AI creates the SOP in minutes.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-slate-900 leading-tight mb-6">
                  Turn Videos Into <br />
                  <span className="text-indigo-600">Step-by-Step Guides</span>
                </h1>
                <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
                  Transform your YouTube tutorials into downloadable PDF guides. Give your audience
                  something they can print, follow along, and share.
                </p>
              </>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onGetStarted}
                className="w-full sm:w-auto px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 hover:shadow-2xl hover:shadow-indigo-300 hover:-translate-y-0.5"
              >
                <i className="fas fa-play mr-2"></i>
                {audience === 'business' ? 'Create Your First SOP' : 'Create Your First Guide'}
              </button>
              <button
                onClick={() => onNavigate(AppView.SUBSCRIPTION)}
                className="w-full sm:w-auto px-8 py-4 bg-white text-slate-700 rounded-2xl font-bold text-lg border-2 border-slate-200 hover:border-slate-300 transition-colors"
              >
                View Pricing
              </button>
            </div>
            <p className="mt-6 text-sm text-slate-500">
              <i className="fas fa-check-circle text-emerald-500 mr-1"></i>
              No credit card required
              <span className="mx-3 text-slate-300">|</span>
              <i className="fas fa-check-circle text-emerald-500 mr-1"></i>
              Unlimited free previews
            </p>
          </div>

          {/* Hero Image/Demo */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent z-10 pointer-events-none"></div>
            <div className="bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-800">
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-800 border-b border-slate-700">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="ml-4 text-slate-400 text-sm">FrameOps Dashboard</span>
              </div>
              <div className="p-6 bg-slate-50">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 bg-white rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <i className="fas fa-video text-indigo-600"></i>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">Machine Setup Procedure</p>
                        <p className="text-xs text-slate-500">12 steps extracted</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                          <div className="w-16 h-10 bg-slate-200 rounded"></div>
                          <div className="flex-1">
                            <div className="h-3 bg-slate-200 rounded w-3/4 mb-1"></div>
                            <div className="h-2 bg-slate-100 rounded w-1/2"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl p-4 shadow-sm">
                      <p className="text-xs font-semibold text-slate-500 mb-2">PPE Required</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">Safety Glasses</span>
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs">Gloves</span>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-sm">
                      <p className="text-xs font-semibold text-slate-500 mb-2">Tools Detected</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">Wrench</span>
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs">Torque Driver</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live SOP Feature Highlight */}
      {audience === 'business' && (
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900 text-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-full text-amber-400 text-sm font-semibold mb-6">
                <i className="fas fa-star"></i>
                Our Killer Feature
              </div>
              <h2 className="text-4xl font-bold mb-4">
                Live SOP Recording
              </h2>
              <p className="text-xl text-slate-400 max-w-2xl mx-auto">
                Just do the task. AI creates the SOP while you work.
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
                          <span className="text-slate-400">Steps captured</span>
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
                    <span className="text-slate-900 text-sm font-semibold">Step detected</span>
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
                    <h3 className="text-lg font-bold mb-1">Just Record Yourself</h3>
                    <p className="text-slate-400">Open your phone, hit record, and do the task as you normally would. No special setup needed.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-microphone text-white text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">Talk While You Work</h3>
                    <p className="text-slate-400">"Now I'm tightening this bolt..." - AI transcribes everything and turns it into professional instructions.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-wand-magic-sparkles text-white text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">AI Does The Rest</h3>
                    <p className="text-slate-400">Scene detection captures the right moments. AI writes clear instructions. You get a complete SOP.</p>
                  </div>
                </div>
                <button
                  onClick={onGetStarted}
                  className="w-full sm:w-auto px-8 py-4 bg-amber-500 text-slate-900 rounded-2xl font-bold text-lg hover:bg-amber-400 transition-all mt-4"
                >
                  <i className="fas fa-play mr-2"></i>
                  Try Live Recording
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Stats Bar */}
      <section className="py-12 bg-indigo-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {audience === 'business' ? (
              <>
                <div>
                  <p className="text-4xl font-bold text-white">95%</p>
                  <p className="text-indigo-200 mt-1">Time Saved</p>
                </div>
                <div>
                  <p className="text-4xl font-bold text-white">10min</p>
                  <p className="text-indigo-200 mt-1">Avg. SOP Creation</p>
                </div>
                <div>
                  <p className="text-4xl font-bold text-white">50+</p>
                  <p className="text-indigo-200 mt-1">Industries Served</p>
                </div>
                <div>
                  <p className="text-4xl font-bold text-white">99.9%</p>
                  <p className="text-indigo-200 mt-1">Uptime</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-4xl font-bold text-white">5min</p>
                  <p className="text-indigo-200 mt-1">Per Guide</p>
                </div>
                <div>
                  <p className="text-4xl font-bold text-white">1-Click</p>
                  <p className="text-indigo-200 mt-1">YouTube Import</p>
                </div>
                <div>
                  <p className="text-4xl font-bold text-white">PDF</p>
                  <p className="text-indigo-200 mt-1">Ready to Share</p>
                </div>
                <div>
                  <p className="text-4xl font-bold text-white">AI</p>
                  <p className="text-indigo-200 mt-1">Transcription</p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 scroll-mt-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Everything You Need</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              From video capture to professional PDF export, FrameOps handles the entire SOP creation workflow.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <div key={i} className="p-8 bg-white rounded-2xl border border-slate-100 hover:shadow-xl hover:border-slate-200 transition-all group">
                <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 transition-colors">
                  <i className={`fas ${feature.icon} text-2xl text-indigo-600 group-hover:text-white transition-colors`}></i>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases - Compact */}
      <section id="use-cases" className="py-12 px-4 sm:px-6 lg:px-8 bg-slate-50 scroll-mt-24">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-slate-600 mb-6">
            {audience === 'business' ? 'Used in:' : 'Perfect for:'}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {useCases.map((useCase, i) => (
              <div key={i} className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-slate-200 text-slate-700 text-sm font-medium">
                <i className={`fas ${useCase.icon} text-indigo-600`}></i>
                {useCase.industry}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 scroll-mt-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Simple, Transparent Pricing</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Start free, upgrade when you need more. No hidden fees.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                    MOST POPULAR
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
                    <span className={plan.highlighted ? 'text-indigo-200' : 'text-slate-500'}>
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
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-900">
        <div className="max-w-4xl mx-auto text-center">
          {audience === 'business' ? (
            <>
              <h2 className="text-4xl font-bold text-white mb-6">
                Ready to Save Hours on Documentation?
              </h2>
              <p className="text-xl text-slate-400 mb-10">
                Join teams who've replaced manual SOP writing with AI-powered automation.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-4xl font-bold text-white mb-6">
                Ready to Level Up Your Content?
              </h2>
              <p className="text-xl text-slate-400 mb-10">
                Give your audience downloadable guides they'll actually use.
              </p>
            </>
          )}
          <button
            onClick={onGetStarted}
            className="px-10 py-5 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-500 transition-colors shadow-xl"
          >
            <i className="fas fa-rocket mr-2"></i>
            Get Started Free
          </button>
          <p className="mt-6 text-slate-500 text-sm">
            No credit card required. Preview any video instantly.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-slate-950">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <i className="fas fa-film text-white"></i>
              </div>
              <span className="font-bold text-white">FrameOps</span>
            </div>
            <div className="flex items-center gap-6 text-slate-400 text-sm">
              <button onClick={() => onNavigate(AppView.PRIVACY)} className="hover:text-white transition-colors">Privacy Policy</button>
              <button onClick={() => onNavigate(AppView.TERMS)} className="hover:text-white transition-colors">Terms of Service</button>
              <a href="mailto:support@frameops.ai" className="hover:text-white transition-colors">Contact</a>
            </div>
            <p className="text-slate-500 text-sm">
              &copy; {new Date().getFullYear()} FrameOps. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
