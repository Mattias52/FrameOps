import React, { useState } from 'react';

// Promo codes - in production, validate these server-side
const VALID_PROMO_CODES: Record<string, { type: 'pro' | 'team'; days: number; name: string }> = {
  'INFLUENCER2024': { type: 'pro', days: 30, name: 'Influencer Program' },
  'CREATOR30': { type: 'pro', days: 30, name: 'Creator Program' },
  'BETAUSER': { type: 'pro', days: 90, name: 'Beta Tester' },
  'TEAMTRIAL': { type: 'team', days: 14, name: 'Team Trial' },
};

const SubscriptionPlans: React.FC = () => {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [promoCode, setPromoCode] = useState('');
  const [promoStatus, setPromoStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [promoMessage, setPromoMessage] = useState('');

  const handlePromoSubmit = () => {
    const code = promoCode.trim().toUpperCase();
    const promo = VALID_PROMO_CODES[code];

    if (promo) {
      // Store promo in localStorage (in production, this would be server-side)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + promo.days);
      localStorage.setItem('frameops_promo', JSON.stringify({
        code,
        type: promo.type,
        expiresAt: expiresAt.toISOString(),
        name: promo.name
      }));
      setPromoStatus('success');
      setPromoMessage(`${promo.name} activated! You have ${promo.type === 'pro' ? 'Pro' : 'Team'} access for ${promo.days} days.`);
    } else {
      setPromoStatus('error');
      setPromoMessage('Invalid promo code. Please check and try again.');
    }
  };

  const plans = [
    {
      name: 'Free Preview',
      monthlyPrice: '0',
      yearlyPrice: '0',
      description: 'Preview any video before you buy',
      features: [
        'Unlimited video previews',
        'See first 3 steps of any SOP',
        'Test with your own videos',
        'No credit card required',
        'Basic AI analysis'
      ],
      limitations: [],
      buttonText: 'Current Plan',
      popular: false,
      color: 'slate'
    },
    {
      name: 'Pro',
      monthlyPrice: '19',
      yearlyPrice: '190',
      description: 'For professionals who need more power',
      features: [
        'Unlimited SOPs',
        'HD frame extraction',
        'No watermark on exports',
        'Priority AI processing',
        'Custom branding on PDFs',
        'Email support'
      ],
      limitations: [],
      buttonText: 'Upgrade to Pro',
      popular: true,
      color: 'indigo'
    },
    {
      name: 'Team',
      monthlyPrice: '49',
      yearlyPrice: '490',
      description: 'Collaboration for growing teams',
      features: [
        'Everything in Pro',
        '5 team members included',
        'Shared SOP library',
        'Team branding templates',
        'Analytics dashboard',
        'Priority support'
      ],
      limitations: [],
      buttonText: 'Start Team Trial',
      popular: false,
      color: 'slate'
    },
    {
      name: 'Enterprise',
      monthlyPrice: 'Custom',
      yearlyPrice: 'Custom',
      description: 'For large organizations',
      features: [
        'Unlimited team members',
        'SSO / SAML integration',
        'API access',
        'Dedicated account manager',
        'Custom integrations',
        'On-premise deployment option',
        'SLA guarantee'
      ],
      limitations: [],
      buttonText: 'Contact Sales',
      popular: false,
      color: 'slate'
    }
  ];

  const faqs = [
    {
      question: 'What counts as one SOP?',
      answer: 'One SOP is a single video processed into a procedure document, regardless of length or number of steps extracted.'
    },
    {
      question: 'Can I upgrade or downgrade anytime?',
      answer: 'Yes! You can change your plan at any time. Upgrades are immediate, and downgrades take effect at the next billing cycle.'
    },
    {
      question: 'Is there a free trial for paid plans?',
      answer: 'Yes, Pro and Team plans come with a 14-day free trial. No credit card required to start.'
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept all major credit cards (Visa, Mastercard, Amex) and can arrange invoicing for Enterprise customers.'
    }
  ];

  return (
    <div className="py-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold text-slate-900 mb-4">Choose Your Plan</h1>
        <p className="text-lg text-slate-500 max-w-2xl mx-auto">
          Start free, upgrade as you grow. All plans include our core AI-powered SOP generation.
        </p>

        {/* Billing Toggle */}
        <div className="mt-8 inline-flex items-center gap-4 p-1.5 bg-slate-100 rounded-xl">
          <button
            onClick={() => setBillingPeriod('monthly')}
            className={`px-6 py-2.5 rounded-lg font-semibold text-sm transition-all ${
              billingPeriod === 'monthly'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingPeriod('yearly')}
            className={`px-6 py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center gap-2 ${
              billingPeriod === 'yearly'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Yearly
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
              Save 17%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto mb-20">
        {plans.map((plan, i) => (
          <div
            key={i}
            className={`relative p-6 rounded-2xl flex flex-col h-full transition-all duration-300 ${
              plan.popular
                ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-200 scale-105 z-10'
                : 'bg-white shadow-sm border border-slate-100 hover:shadow-lg hover:border-slate-200'
            }`}
          >
            {plan.popular && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1 bg-amber-400 text-amber-900 text-xs font-bold rounded-full uppercase tracking-wide">
                Most Popular
              </div>
            )}

            <div className="mb-6">
              <h3 className={`text-xl font-bold mb-2 ${plan.popular ? 'text-white' : 'text-slate-900'}`}>
                {plan.name}
              </h3>
              <div className="flex items-baseline gap-1">
                <span className={`text-4xl font-extrabold ${plan.popular ? 'text-white' : 'text-slate-900'}`}>
                  {plan.monthlyPrice === 'Custom' ? '' : '$'}
                  {billingPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice}
                </span>
                {plan.monthlyPrice !== 'Custom' && (
                  <span className={plan.popular ? 'text-indigo-200' : 'text-slate-500'}>
                    /{billingPeriod === 'monthly' ? 'mo' : 'yr'}
                  </span>
                )}
              </div>
              <p className={`mt-3 text-sm leading-relaxed ${plan.popular ? 'text-indigo-200' : 'text-slate-500'}`}>
                {plan.description}
              </p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((feature, j) => (
                <li key={j} className={`flex items-start gap-3 text-sm ${plan.popular ? 'text-white' : 'text-slate-700'}`}>
                  <i className={`fas fa-check mt-0.5 ${plan.popular ? 'text-indigo-300' : 'text-emerald-500'}`}></i>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button
              className={`w-full py-3.5 rounded-xl font-bold transition-all ${
                plan.popular
                  ? 'bg-white text-indigo-600 hover:bg-indigo-50'
                  : plan.name === 'Free'
                    ? 'bg-slate-100 text-slate-400 cursor-default'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'
              }`}
            >
              {plan.buttonText}
            </button>
          </div>
        ))}
      </div>

      {/* Feature Comparison */}
      <div className="max-w-5xl mx-auto mb-20">
        <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">Compare Features</h2>
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left p-4 font-semibold text-slate-900">Feature</th>
                <th className="p-4 font-semibold text-slate-900 text-center">Free</th>
                <th className="p-4 font-semibold text-indigo-600 text-center bg-indigo-50">Pro</th>
                <th className="p-4 font-semibold text-slate-900 text-center">Team</th>
                <th className="p-4 font-semibold text-slate-900 text-center">Enterprise</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr className="border-b border-slate-50">
                <td className="p-4 text-slate-700">Full SOPs</td>
                <td className="p-4 text-center text-slate-600">Preview only</td>
                <td className="p-4 text-center bg-indigo-50 text-indigo-700 font-semibold">Unlimited</td>
                <td className="p-4 text-center text-slate-600">Unlimited</td>
                <td className="p-4 text-center text-slate-600">Unlimited</td>
              </tr>
              <tr className="border-b border-slate-50">
                <td className="p-4 text-slate-700">Video quality</td>
                <td className="p-4 text-center text-slate-600">720p</td>
                <td className="p-4 text-center bg-indigo-50 text-indigo-700 font-semibold">1080p HD</td>
                <td className="p-4 text-center text-slate-600">1080p HD</td>
                <td className="p-4 text-center text-slate-600">4K</td>
              </tr>
              <tr className="border-b border-slate-50">
                <td className="p-4 text-slate-700">PDF watermark</td>
                <td className="p-4 text-center"><i className="fas fa-check text-slate-400"></i></td>
                <td className="p-4 text-center bg-indigo-50"><i className="fas fa-times text-slate-300"></i></td>
                <td className="p-4 text-center"><i className="fas fa-times text-slate-300"></i></td>
                <td className="p-4 text-center"><i className="fas fa-times text-slate-300"></i></td>
              </tr>
              <tr className="border-b border-slate-50">
                <td className="p-4 text-slate-700">Custom branding</td>
                <td className="p-4 text-center"><i className="fas fa-times text-slate-300"></i></td>
                <td className="p-4 text-center bg-indigo-50"><i className="fas fa-check text-indigo-600"></i></td>
                <td className="p-4 text-center"><i className="fas fa-check text-emerald-500"></i></td>
                <td className="p-4 text-center"><i className="fas fa-check text-emerald-500"></i></td>
              </tr>
              <tr className="border-b border-slate-50">
                <td className="p-4 text-slate-700">Team members</td>
                <td className="p-4 text-center text-slate-600">1</td>
                <td className="p-4 text-center bg-indigo-50 text-slate-600">1</td>
                <td className="p-4 text-center text-slate-600">5</td>
                <td className="p-4 text-center text-slate-600">Unlimited</td>
              </tr>
              <tr className="border-b border-slate-50">
                <td className="p-4 text-slate-700">API access</td>
                <td className="p-4 text-center"><i className="fas fa-times text-slate-300"></i></td>
                <td className="p-4 text-center bg-indigo-50"><i className="fas fa-times text-slate-300"></i></td>
                <td className="p-4 text-center"><i className="fas fa-times text-slate-300"></i></td>
                <td className="p-4 text-center"><i className="fas fa-check text-emerald-500"></i></td>
              </tr>
              <tr>
                <td className="p-4 text-slate-700">Support</td>
                <td className="p-4 text-center text-slate-600">Community</td>
                <td className="p-4 text-center bg-indigo-50 text-slate-600">Email</td>
                <td className="p-4 text-center text-slate-600">Priority</td>
                <td className="p-4 text-center text-slate-600">Dedicated</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Promo Code Section */}
      <div className="max-w-md mx-auto mb-20">
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-8 border border-indigo-100">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <i className="fas fa-gift text-indigo-600 text-xl"></i>
            </div>
            <h3 className="text-lg font-bold text-slate-900">Have a promo code?</h3>
            <p className="text-sm text-slate-500 mt-1">Enter your code to unlock special access</p>
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value);
                setPromoStatus('idle');
              }}
              placeholder="Enter promo code..."
              className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm font-medium uppercase"
            />
            <button
              onClick={handlePromoSubmit}
              disabled={!promoCode.trim()}
              className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>

          {promoStatus === 'success' && (
            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="flex items-center gap-2 text-emerald-700">
                <i className="fas fa-check-circle"></i>
                <span className="font-semibold text-sm">{promoMessage}</span>
              </div>
            </div>
          )}

          {promoStatus === 'error' && (
            <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl">
              <div className="flex items-center gap-2 text-rose-700">
                <i className="fas fa-times-circle"></i>
                <span className="font-semibold text-sm">{promoMessage}</span>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-400 text-center mt-4">
            Influencer? Creator? <a href="mailto:partners@frameops.ai" className="text-indigo-600 hover:underline">Contact us</a> for a free trial code.
          </p>
        </div>
      </div>

      {/* FAQ Section */}
      <div className="max-w-3xl mx-auto mb-16">
        <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 p-6">
              <h3 className="font-semibold text-slate-900 mb-2">{faq.question}</h3>
              <p className="text-slate-600 text-sm">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Trust Section */}
      <div className="text-center">
        <div className="inline-flex items-center gap-6 text-slate-400 text-sm">
          <div className="flex items-center gap-2">
            <i className="fas fa-lock"></i>
            <span>256-bit SSL</span>
          </div>
          <div className="flex items-center gap-2">
            <i className="fas fa-shield-halved"></i>
            <span>SOC 2 Compliant</span>
          </div>
          <div className="flex items-center gap-2">
            <i className="fas fa-credit-card"></i>
            <span>Secure Payments</span>
          </div>
        </div>
        <p className="text-slate-400 text-sm mt-4">
          Need a custom solution?
          <a href="mailto:sales@frameops.ai" className="text-indigo-600 font-semibold ml-1 hover:underline">
            Contact our sales team
          </a>
        </p>
      </div>
    </div>
  );
};

export default SubscriptionPlans;
