// Stripe service for handling subscriptions
// Uses Stripe Checkout for simple, secure payments

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
const STRIPE_PRO_PRICE_ID = import.meta.env.VITE_STRIPE_PRO_PRICE_ID || '';

// Check if Stripe is configured
export const isStripeConfigured = () => {
  return Boolean(STRIPE_PUBLISHABLE_KEY && STRIPE_PRO_PRICE_ID);
};

// Load Stripe.js dynamically
let stripePromise: Promise<any> | null = null;
const getStripe = async () => {
  if (!stripePromise && STRIPE_PUBLISHABLE_KEY) {
    // @ts-ignore - Stripe loaded from CDN
    stripePromise = import('https://js.stripe.com/v3/').then(() => {
      // @ts-ignore
      return window.Stripe(STRIPE_PUBLISHABLE_KEY);
    }).catch(() => {
      // Fallback: load from script tag
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.onload = () => {
          // @ts-ignore
          resolve(window.Stripe(STRIPE_PUBLISHABLE_KEY));
        };
        document.head.appendChild(script);
      });
    });
  }
  return stripePromise;
};

// Subscription status stored in localStorage (will be replaced with server-side check)
export const getSubscriptionStatus = (): { isPro: boolean; expiresAt: string | null } => {
  if (typeof window === 'undefined') return { isPro: false, expiresAt: null };

  const stored = localStorage.getItem('frameops_subscription');
  if (!stored) return { isPro: false, expiresAt: null };

  try {
    const data = JSON.parse(stored);
    // Check if subscription is still valid
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
      localStorage.removeItem('frameops_subscription');
      return { isPro: false, expiresAt: null };
    }
    return { isPro: data.isPro || false, expiresAt: data.expiresAt };
  } catch {
    return { isPro: false, expiresAt: null };
  }
};

// Set subscription status (called after successful payment or webhook)
export const setSubscriptionStatus = (isPro: boolean, expiresAt?: string) => {
  if (typeof window === 'undefined') return;

  if (isPro) {
    localStorage.setItem('frameops_subscription', JSON.stringify({
      isPro: true,
      expiresAt: expiresAt || null,
      updatedAt: new Date().toISOString()
    }));
  } else {
    localStorage.removeItem('frameops_subscription');
  }
};

// Track SOP usage for freemium model
export const getSOPUsage = (): number => {
  if (typeof window === 'undefined') return 0;
  return parseInt(localStorage.getItem('frameops_sops_created') || '0', 10);
};

export const incrementSOPUsage = (): number => {
  const current = getSOPUsage();
  const newCount = current + 1;
  localStorage.setItem('frameops_sops_created', newCount.toString());
  return newCount;
};

// Create a Stripe Checkout session
// Note: In production, this should go through your backend to create a secure session
export const createCheckoutSession = async (
  successUrl: string = window.location.origin + '?payment=success',
  cancelUrl: string = window.location.origin + '?payment=cancelled'
): Promise<{ error?: string }> => {
  if (!isStripeConfigured()) {
    return { error: 'Stripe is not configured. Please add VITE_STRIPE_PUBLISHABLE_KEY and VITE_STRIPE_PRO_PRICE_ID to your environment.' };
  }

  try {
    const stripe = await getStripe();
    if (!stripe) {
      return { error: 'Failed to load Stripe' };
    }

    // For a production app, you would:
    // 1. Call your backend to create a Checkout Session
    // 2. Backend creates session with stripe.checkout.sessions.create()
    // 3. Return the session ID to the frontend
    // 4. Redirect to Stripe Checkout

    // For now, we'll use Stripe's client-only checkout with price ID
    // This requires the price to be set up in Stripe Dashboard
    const { error } = await stripe.redirectToCheckout({
      lineItems: [{ price: STRIPE_PRO_PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      successUrl,
      cancelUrl,
    });

    if (error) {
      console.error('Stripe checkout error:', error);
      return { error: error.message };
    }

    return {};
  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    return { error: err.message || 'Failed to start checkout' };
  }
};

// Handle payment success (called when user returns from Stripe)
export const handlePaymentSuccess = () => {
  // In production, you would verify the payment with your backend
  // For now, we'll trust the URL parameter and set Pro status

  // Set subscription for 30 days (will be managed by Stripe webhooks in production)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  setSubscriptionStatus(true, expiresAt.toISOString());

  // Clear the URL parameter
  const url = new URL(window.location.href);
  url.searchParams.delete('payment');
  window.history.replaceState({}, '', url.toString());

  return true;
};

// Check for payment status in URL on page load
export const checkPaymentStatus = (): 'success' | 'cancelled' | null => {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');

  if (payment === 'success') {
    handlePaymentSuccess();
    return 'success';
  } else if (payment === 'cancelled') {
    // Clear the URL parameter
    const url = new URL(window.location.href);
    url.searchParams.delete('payment');
    window.history.replaceState({}, '', url.toString());
    return 'cancelled';
  }

  return null;
};
