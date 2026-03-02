import React, { useEffect } from 'react';
import { AppView } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface IndustryConfig {
  industry: string;
  headline: string;
  subheadline: string;
  heroImage: string;
  benefits: { icon: string; title: string; description: string }[];
  useCases: { title: string; description: string }[];
  testimonial?: { quote: string; author: string; role: string };
  keywords: string[];
}

const industries: Record<string, IndustryConfig> = {
  manufacturing: {
    industry: 'Manufacturing',
    headline: 'Turn Factory Floor Videos into Professional SOPs',
    subheadline: 'AI-powered standard operating procedures for machine setup, maintenance, and quality control. Reduce training time by 60%.',
    heroImage: 'fa-industry',
    keywords: ['manufacturing sop software', 'factory sop generator', 'machine setup procedures', 'quality control documentation'],
    benefits: [
      { icon: 'fa-clock', title: 'Save 10+ Hours Per SOP', description: 'Record once, get complete documentation. No more writing procedures from scratch.' },
      { icon: 'fa-shield-halved', title: 'Automatic Safety Detection', description: 'AI identifies PPE requirements, hazards, and safety steps from your videos.' },
      { icon: 'fa-language', title: 'Multi-Language Support', description: 'Generate SOPs in any language for your global workforce.' },
      { icon: 'fa-file-pdf', title: 'Print-Ready PDFs', description: 'Professional documentation ready for the shop floor or audits.' }
    ],
    useCases: [
      { title: 'Machine Setup & Changeover', description: 'Document complex setup procedures with visual step-by-step guides.' },
      { title: 'Preventive Maintenance', description: 'Create maintenance checklists with photos from actual procedures.' },
      { title: 'Quality Inspections', description: 'Standardize inspection processes with clear visual references.' },
      { title: 'New Employee Training', description: 'Onboard faster with video-based SOPs they can follow along.' }
    ],
    testimonial: {
      quote: 'We reduced our SOP creation time from 8 hours to 30 minutes. Game changer for our lean initiatives.',
      author: 'Operations Manager',
      role: 'Automotive Parts Manufacturer'
    }
  },
  healthcare: {
    industry: 'Healthcare',
    headline: 'Clinical Procedure Documentation Made Simple',
    subheadline: 'Transform training videos into compliant clinical SOPs. Perfect for hospitals, clinics, and medical device companies.',
    heroImage: 'fa-hospital',
    keywords: ['healthcare sop software', 'clinical procedure documentation', 'medical sop generator', 'hospital training documentation'],
    benefits: [
      { icon: 'fa-clipboard-check', title: 'Compliance Ready', description: 'Documentation that meets healthcare regulatory requirements.' },
      { icon: 'fa-user-nurse', title: 'Reduce Training Variance', description: 'Ensure every staff member follows the same proven procedures.' },
      { icon: 'fa-lock', title: 'HIPAA Considerations', description: 'Keep sensitive procedures documented securely.' },
      { icon: 'fa-sync', title: 'Easy Updates', description: 'Re-record and regenerate when procedures change.' }
    ],
    useCases: [
      { title: 'Clinical Procedures', description: 'Document patient care procedures with visual clarity.' },
      { title: 'Equipment Operation', description: 'Create guides for medical devices and diagnostic equipment.' },
      { title: 'Sterilization Protocols', description: 'Ensure infection control procedures are followed precisely.' },
      { title: 'Emergency Response', description: 'Clear step-by-step guides for critical situations.' }
    ]
  },
  training: {
    industry: 'Training & HR',
    headline: 'Video-Based Training Documentation',
    subheadline: 'Convert any training video into structured learning materials. Perfect for onboarding, compliance, and skills development.',
    heroImage: 'fa-graduation-cap',
    keywords: ['training documentation software', 'onboarding sop generator', 'employee training materials', 'video to training guide'],
    benefits: [
      { icon: 'fa-users', title: 'Faster Onboarding', description: 'New hires learn faster with visual step-by-step guides.' },
      { icon: 'fa-check-double', title: 'Consistent Training', description: 'Everyone learns the same way, every time.' },
      { icon: 'fa-chart-line', title: 'Track Completion', description: 'Know who has reviewed which procedures.' },
      { icon: 'fa-mobile', title: 'Mobile Accessible', description: 'Training materials available on any device.' }
    ],
    useCases: [
      { title: 'New Employee Onboarding', description: 'Create day-one guides from your best trainers\' demonstrations.' },
      { title: 'Safety Training', description: 'Document safety procedures with clear visual references.' },
      { title: 'Software Training', description: 'Turn screen recordings into click-by-click guides.' },
      { title: 'Skills Certification', description: 'Standardize skill assessments with documented procedures.' }
    ]
  }
};

interface IndustryPageProps {
  industry: 'manufacturing' | 'healthcare' | 'training';
  onNavigate: (view: AppView) => void;
  onGetStarted: () => void;
}

const IndustryPage: React.FC<IndustryPageProps> = ({ industry, onNavigate, onGetStarted }) => {
  const { user, loading } = useAuth();
  const config = industries[industry];

  // Auto-enter app when user is logged in
  useEffect(() => {
    if (!loading && user) {
      onGetStarted();
    }
  }, [user, loading, onGetStarted]);

  // SEO: Update document title and meta
  useEffect(() => {
    document.title = `${config.industry} SOP Software | FrameOps - AI Video to SOP Generator`;

    // Update meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', `${config.subheadline} Try FrameOps free.`);
    }
  }, [config]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-indigo-900">
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <button onClick={() => onNavigate(AppView.LANDING)} className="flex items-center gap-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-xl">F</span>
          </div>
          <span className="text-white font-bold text-xl">FrameOps</span>
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={() => onNavigate(AppView.LANDING)}
            className="text-slate-300 hover:text-white transition-colors text-sm"
          >
            All Industries
          </button>
          <button
            onClick={onGetStarted}
            className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-500 transition-colors"
          >
            Try Free
          </button>
        </div>
      </nav>

      {/* Hero */}
      <header className="px-6 py-16 md:py-24 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600/20 rounded-full text-indigo-300 text-sm mb-6">
          <i className={`fas ${config.heroImage}`}></i>
          <span>For {config.industry}</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
          {config.headline}
        </h1>
        <p className="text-xl text-slate-300 mb-8 max-w-3xl mx-auto">
          {config.subheadline}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={onGetStarted}
            className="px-8 py-4 bg-indigo-600 text-white font-bold text-lg rounded-xl hover:bg-indigo-500 transition-colors"
          >
            <i className="fas fa-play mr-2"></i>
            Start Free
          </button>
          <button
            onClick={() => onNavigate(AppView.LANDING)}
            className="px-8 py-4 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors"
          >
            See How It Works
          </button>
        </div>
      </header>

      {/* Benefits */}
      <section className="px-6 py-16 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-white text-center mb-12">
          Why {config.industry} Teams Choose FrameOps
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {config.benefits.map((benefit, idx) => (
            <div key={idx} className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
              <div className="w-12 h-12 bg-indigo-600/20 rounded-xl flex items-center justify-center mb-4">
                <i className={`fas ${benefit.icon} text-indigo-400 text-xl`}></i>
              </div>
              <h3 className="text-white font-bold mb-2">{benefit.title}</h3>
              <p className="text-slate-400 text-sm">{benefit.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section className="px-6 py-16 bg-black/20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-4">
            {config.industry} Use Cases
          </h2>
          <p className="text-slate-400 text-center mb-12 max-w-2xl mx-auto">
            See how {config.industry.toLowerCase()} professionals use FrameOps to streamline documentation.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {config.useCases.map((useCase, idx) => (
              <div key={idx} className="bg-white/5 rounded-xl p-6 border border-white/10 hover:border-indigo-500/50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold">{idx + 1}</span>
                  </div>
                  <div>
                    <h3 className="text-white font-bold mb-2">{useCase.title}</h3>
                    <p className="text-slate-400 text-sm">{useCase.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      {config.testimonial && (
        <section className="px-6 py-16 max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 rounded-3xl p-8 md:p-12 border border-indigo-500/20">
            <i className="fas fa-quote-left text-4xl text-indigo-400 mb-6"></i>
            <p className="text-xl md:text-2xl text-white mb-6 italic">
              "{config.testimonial.quote}"
            </p>
            <div>
              <p className="text-white font-bold">{config.testimonial.author}</p>
              <p className="text-slate-400 text-sm">{config.testimonial.role}</p>
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="px-6 py-16 text-center">
        <h2 className="text-3xl font-bold text-white mb-4">
          Ready to Transform Your {config.industry} Documentation?
        </h2>
        <p className="text-slate-400 mb-8">
          Join thousands of professionals creating better SOPs with AI.
        </p>
        <button
          onClick={onGetStarted}
          className="px-8 py-4 bg-indigo-600 text-white font-bold text-lg rounded-xl hover:bg-indigo-500 transition-colors"
        >
          Get Started Free
        </button>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-slate-500 text-sm">
            &copy; 2025 FrameOps. AI-powered SOP generation.
          </p>
          <div className="flex gap-6">
            <button onClick={() => onNavigate(AppView.PRIVACY)} className="text-slate-500 hover:text-white text-sm">
              Privacy
            </button>
            <button onClick={() => onNavigate(AppView.TERMS)} className="text-slate-500 hover:text-white text-sm">
              Terms
            </button>
            <button onClick={() => onNavigate(AppView.LANDING)} className="text-slate-500 hover:text-white text-sm">
              Home
            </button>
          </div>
        </div>
      </footer>

      {/* Hidden SEO keywords */}
      <div className="sr-only">
        {config.keywords.join(', ')}
      </div>
    </div>
  );
};

export default IndustryPage;
