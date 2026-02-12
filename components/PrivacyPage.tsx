import React from 'react';
import { AppView } from '../types';

interface PrivacyPageProps {
  onNavigate: (view: AppView) => void;
}

const PrivacyPage: React.FC<PrivacyPageProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md z-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => onNavigate(AppView.LANDING)}
            >
              <div className="w-16 h-16 rounded-xl flex items-center justify-center">
                <img src="/logo.png" alt="FrameOps" className="w-16 h-16" />
              </div>
              <span className="font-bold text-xl text-slate-900">FrameOps</span>
            </div>
            <button
              onClick={() => onNavigate(AppView.LANDING)}
              className="text-slate-600 hover:text-slate-900 font-medium"
            >
              <i className="fas fa-arrow-left mr-2"></i>
              Back to Home
            </button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold text-slate-900 mb-8">Privacy Policy</h1>
          <p className="text-slate-500 mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

          <div className="prose prose-slate max-w-none">
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Introduction</h2>
              <p className="text-slate-600 mb-4">
                FrameOps ("we", "our", or "us") respects your privacy and is committed to protecting your personal data.
                This privacy policy explains how we collect, use, and safeguard your information when you use our SOP
                generation service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Information We Collect</h2>
              <p className="text-slate-600 mb-4">We collect the following types of information:</p>
              <ul className="list-disc pl-6 text-slate-600 space-y-2">
                <li><strong>Account Information:</strong> Email address and name when you create an account.</li>
                <li><strong>Video Content:</strong> Videos you upload or YouTube URLs you provide for SOP generation.</li>
                <li><strong>Generated Content:</strong> SOPs, transcripts, and other content created through our service.</li>
                <li><strong>Usage Data:</strong> How you interact with our service, including features used and time spent.</li>
                <li><strong>Technical Data:</strong> Browser type, device information, and IP address for service optimization.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">3. How We Use Your Information</h2>
              <p className="text-slate-600 mb-4">We use your information to:</p>
              <ul className="list-disc pl-6 text-slate-600 space-y-2">
                <li>Provide and improve our SOP generation service</li>
                <li>Process your videos and generate documentation</li>
                <li>Communicate with you about your account and our services</li>
                <li>Ensure the security and integrity of our platform</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Data Storage and Security</h2>
              <p className="text-slate-600 mb-4">
                Your data is stored securely using industry-standard encryption. We use Supabase for database storage
                and implement appropriate technical and organizational measures to protect your personal data against
                unauthorized access, alteration, or destruction.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">5. Third-Party Services</h2>
              <p className="text-slate-600 mb-4">We use the following third-party services:</p>
              <ul className="list-disc pl-6 text-slate-600 space-y-2">
                <li><strong>AI Services:</strong> For video analysis and content generation</li>
                <li><strong>Supabase:</strong> For secure data storage and authentication</li>
                <li><strong>YouTube API:</strong> For accessing public video content you request</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Your Rights</h2>
              <p className="text-slate-600 mb-4">You have the right to:</p>
              <ul className="list-disc pl-6 text-slate-600 space-y-2">
                <li>Access your personal data</li>
                <li>Correct inaccurate data</li>
                <li>Delete your data and account</li>
                <li>Export your data</li>
                <li>Opt out of marketing communications</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">7. Contact Us</h2>
              <p className="text-slate-600 mb-4">
                If you have questions about this privacy policy or our data practices, please contact us at:
              </p>
              <p className="text-slate-600">
                <strong>Email:</strong> <a href="mailto:support@frameops.ai" className="text-indigo-600 hover:underline">support@frameops.ai</a>
              </p>
            </section>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-slate-100">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-slate-500 text-sm">
            &copy; {new Date().getFullYear()} FrameOps. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PrivacyPage;
