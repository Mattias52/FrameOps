
import React from 'react';

const SubscriptionPlans: React.FC = () => {
  const plans = [
    {
      name: 'Starter',
      price: '0',
      description: 'Perfect for individual builders and hobbyists.',
      features: ['3 SOPs per month', '720p Analysis', 'Standard Export', 'Basic Support'],
      buttonText: 'Current Plan',
      popular: false,
      color: 'slate'
    },
    {
      name: 'Pro',
      price: '49',
      description: 'Ideal for small teams and workshops.',
      features: ['Unlimited SOPs', '1080p Frame Analysis', 'Priority Gemini Queue', 'PDF & DOCX Export', 'Custom Branding'],
      buttonText: 'Upgrade to Pro',
      popular: true,
      color: 'indigo'
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      description: 'For large-scale industrial operations.',
      features: ['SSO Integration', 'API Access', 'Dedicated Success Manager', 'On-premise Options', '99.9% Uptime SLA'],
      buttonText: 'Contact Sales',
      popular: false,
      color: 'slate'
    }
  ];

  return (
    <div className="py-8 animate-in fade-in duration-500">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded-full text-sm font-semibold mb-4">
          <i className="fas fa-clock"></i>
          Coming Soon
        </div>
        <h1 className="text-4xl font-extrabold text-slate-900 mb-4">Subscription Plans</h1>
        <p className="text-lg text-slate-500 max-w-2xl mx-auto">
          Premium features and team plans are in development. Currently, all features are free during beta.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {plans.map((plan, i) => (
          <div 
            key={i} 
            className={`relative p-8 rounded-3xl flex flex-col h-full transition-all duration-300 ${
              plan.popular 
                ? 'bg-white shadow-2xl shadow-indigo-200 border-2 border-indigo-500 scale-105 z-10' 
                : 'bg-white shadow-sm border border-slate-100 hover:shadow-lg'
            }`}
          >
            {plan.popular && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full uppercase tracking-widest">
                Most Popular
              </div>
            )}
            
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-2">{plan.name}</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-slate-900">
                  {plan.price === 'Custom' ? '' : '$'}{plan.price}
                </span>
                {plan.price !== 'Custom' && <span className="text-slate-500 font-medium">/month</span>}
              </div>
              <p className="mt-4 text-slate-500 text-sm leading-relaxed">{plan.description}</p>
            </div>

            <ul className="space-y-4 mb-10 flex-1">
              {plan.features.map((feature, j) => (
                <li key={j} className="flex items-center gap-3 text-sm text-slate-700">
                  <i className={`fas fa-check-circle ${plan.popular ? 'text-indigo-500' : 'text-slate-300'}`}></i>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              disabled
              className="w-full py-4 rounded-2xl font-bold bg-slate-100 text-slate-400 cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>
        ))}
      </div>

      <div className="mt-20 text-center">
        <p className="text-slate-400 text-sm">
          All plans include 256-bit SSL security and encrypted storage. Need a custom quote? 
          <a href="#" className="text-indigo-600 font-bold ml-1 hover:underline">Get in touch</a>
        </p>
      </div>
    </div>
  );
};

export default SubscriptionPlans;
