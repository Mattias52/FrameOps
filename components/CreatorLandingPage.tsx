import React from 'react';
import { AppView } from '../types';

interface CreatorLandingPageProps {
  onGetStarted: () => void;
  onNavigate: (view: AppView) => void;
}

const CreatorLandingPage: React.FC<CreatorLandingPageProps> = ({ onGetStarted, onNavigate }) => {
  const useCases = [
    {
      icon: "fa-hammer",
      title: "DIY & Makers",
      description: "Turn build videos into printable project guides with measurements, materials lists, and step-by-step photos.",
      example: "\"Build this coffee table\" → Complete woodworking SOP"
    },
    {
      icon: "fa-dumbbell",
      title: "Fitness & Health",
      description: "Transform workout videos into structured training programs your clients can follow at the gym.",
      example: "\"12-week transformation\" → Daily workout SOPs"
    },
    {
      icon: "fa-utensils",
      title: "Cooking & Recipes",
      description: "Convert cooking videos into professional recipe cards with exact ingredients and timings.",
      example: "\"Perfect pasta\" → Restaurant-quality recipe SOP"
    },
    {
      icon: "fa-paint-brush",
      title: "Beauty & Tutorials",
      description: "Create detailed makeup guides your audience can reference while getting ready.",
      example: "\"Wedding makeup look\" → Step-by-step beauty SOP"
    },
    {
      icon: "fa-laptop-code",
      title: "Tech & Setup",
      description: "Turn setup/installation videos into IT-style documentation your viewers can follow.",
      example: "\"Home office setup\" → Technical installation guide"
    },
    {
      icon: "fa-seedling",
      title: "Gardening & Home",
      description: "Create seasonal guides and project plans from your gardening or home improvement content.",
      example: "\"Spring garden prep\" → Complete planting SOP"
    }
  ];

  const benefits = [
    {
      icon: "fa-dollar-sign",
      title: "New Revenue Stream",
      description: "Sell SOPs on Gumroad, Patreon, or your own site. Your video is free, the guide is premium."
    },
    {
      icon: "fa-heart",
      title: "Deeper Fan Connection",
      description: "Give your audience something tangible. They'll actually DO what you teach, not just watch."
    },
    {
      icon: "fa-clock",
      title: "Zero Extra Work",
      description: "Just paste your YouTube link. AI extracts frames and creates the SOP automatically."
    },
    {
      icon: "fa-infinity",
      title: "Passive Income",
      description: "Create once, sell forever. Your old videos become evergreen products."
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
              <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
                <i className="fas fa-film text-white text-lg"></i>
              </div>
              <span className="font-bold text-xl">FrameOps</span>
              <span className="px-2 py-0.5 bg-amber-500 text-slate-900 text-[10px] font-bold rounded-full uppercase">
                For Creators
              </span>
            </div>
            <button
              onClick={onGetStarted}
              className="px-5 py-2.5 bg-amber-500 text-slate-900 rounded-xl font-bold hover:bg-amber-400 transition-colors"
            >
              Get Free Access
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-full text-amber-400 text-sm font-medium mb-8">
            <i className="fas fa-star"></i>
            <span>Free Pro access for creators during beta</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight mb-6">
            Turn Your Videos Into
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
              Sellable Guides
            </span>
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10">
            Your followers watch your videos once and forget. Give them something they can
            <strong className="text-white"> print, follow, and actually use</strong>.
            And monetize your content beyond ads.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto px-8 py-4 bg-amber-500 text-slate-900 rounded-2xl font-bold text-lg hover:bg-amber-400 transition-all shadow-xl shadow-amber-500/20"
            >
              <i className="fab fa-youtube mr-2"></i>
              Try With Your YouTube Video
            </button>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto px-8 py-4 bg-slate-800 text-white rounded-2xl font-bold text-lg border border-slate-700 hover:border-slate-600 transition-colors"
            >
              See How It Works
            </a>
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
                  Generate SOP
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
                AI extracts key frames and generates step-by-step instructions
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Why Creators Love FrameOps
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
            <h2 className="text-3xl font-bold mb-4">Perfect For Your Niche</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              No matter what you create, your audience wants guides they can actually follow.
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
            From YouTube Video to Sellable Guide in 3 Steps
          </h2>
          <div className="space-y-8">
            {[
              {
                step: "1",
                title: "Paste Your YouTube Link",
                description: "Just copy your video URL. Works with any public YouTube video.",
                icon: "fa-link"
              },
              {
                step: "2",
                title: "AI Creates Your SOP",
                description: "Our AI watches your video, extracts key frames, and writes professional step-by-step instructions.",
                icon: "fa-magic"
              },
              {
                step: "3",
                title: "Edit, Export & Sell",
                description: "Customize the guide, export as PDF, and sell on Gumroad, Patreon, or your own site.",
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

      {/* CTA */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-emerald-400 text-sm font-medium mb-6">
            <i className="fas fa-gift"></i>
            <span>Limited beta offer</span>
          </div>
          <h2 className="text-4xl font-bold mb-6">
            Get Free Pro Access During Beta
          </h2>
          <p className="text-slate-400 text-lg mb-8">
            We're looking for creators to help shape FrameOps. In exchange, you get full Pro access
            for free - no credit card, no catch.
          </p>
          <div className="bg-slate-800/50 rounded-2xl p-6 mb-8 border border-slate-700">
            <h3 className="font-bold mb-4">What Beta Creators Get:</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
              {[
                "Unlimited SOP generation",
                "PDF & Word export",
                "Custom branding",
                "Direct support from founders",
                "Feature requests priority",
                "Early access to new features"
              ].map((perk, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <i className="fas fa-check text-emerald-400"></i>
                  <span className="text-slate-300">{perk}</span>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={onGetStarted}
            className="px-10 py-4 bg-amber-500 text-slate-900 rounded-2xl font-bold text-lg hover:bg-amber-400 transition-all shadow-xl shadow-amber-500/20"
          >
            <i className="fas fa-rocket mr-2"></i>
            Start Creating SOPs - Free
          </button>
          <p className="text-slate-500 text-sm mt-4">
            No credit card required. Try with your own YouTube video.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-film text-white"></i>
            </div>
            <span className="font-bold">FrameOps</span>
          </div>
          <div className="flex items-center gap-6 text-slate-400 text-sm">
            <button onClick={() => onNavigate(AppView.PRIVACY)} className="hover:text-white transition-colors">Privacy Policy</button>
            <button onClick={() => onNavigate(AppView.TERMS)} className="hover:text-white transition-colors">Terms of Service</button>
            <a href="mailto:support@frameops.ai" className="hover:text-white transition-colors">Contact</a>
          </div>
          <p className="text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} FrameOps. Made for creators.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default CreatorLandingPage;
