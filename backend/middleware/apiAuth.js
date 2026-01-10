const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client for API key validation
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
  console.log('Supabase connected for API auth');
} else {
  console.warn('Supabase not configured - API auth will use demo mode');
}

// Demo API keys for testing (when Supabase not configured)
const DEMO_API_KEYS = {
  'demo-key-12345': {
    userId: 'demo-user',
    plan: 'pro',
    rateLimit: 100,
    name: 'Demo Account'
  },
  'test-key-67890': {
    userId: 'test-user',
    plan: 'free',
    rateLimit: 10,
    name: 'Test Account'
  }
};

/**
 * Validate API key and attach user info to request
 */
const validateApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({
      error: 'API key required',
      message: 'Please provide your API key in the X-API-Key header',
      docs: '/api/docs'
    });
  }

  try {
    let keyData = null;

    if (supabase) {
      // Validate against Supabase
      const { data, error } = await supabase
        .from('api_keys')
        .select('*, users(email, plan)')
        .eq('key', apiKey)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return res.status(401).json({
          error: 'Invalid API key',
          message: 'The provided API key is invalid or has been deactivated'
        });
      }

      keyData = {
        keyId: data.id,
        userId: data.user_id,
        plan: data.users?.plan || 'free',
        rateLimit: data.rate_limit || 10,
        name: data.name
      };

      // Update last_used timestamp
      await supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', data.id);

    } else {
      // Demo mode - use hardcoded keys
      if (DEMO_API_KEYS[apiKey]) {
        keyData = DEMO_API_KEYS[apiKey];
      } else {
        return res.status(401).json({
          error: 'Invalid API key',
          message: 'Demo mode: Use "demo-key-12345" or "test-key-67890"'
        });
      }
    }

    // Attach key data to request
    req.apiKey = keyData;
    next();

  } catch (error) {
    console.error('API key validation error:', error);
    return res.status(500).json({
      error: 'Authentication error',
      message: 'Failed to validate API key'
    });
  }
};

/**
 * Log API usage to Supabase
 */
const logApiUsage = async (req, res, next) => {
  const startTime = Date.now();

  // Capture response
  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - startTime;

    // Log usage asynchronously (don't block response)
    if (supabase && req.apiKey) {
      supabase.from('api_usage').insert({
        api_key_id: req.apiKey.keyId,
        user_id: req.apiKey.userId,
        endpoint: req.path,
        method: req.method,
        status_code: res.statusCode,
        duration_ms: duration,
        request_size: req.headers['content-length'] || 0,
        ip_address: req.ip || req.headers['x-forwarded-for']
      }).then(() => {}).catch(err => {
        console.warn('Failed to log API usage:', err.message);
      });
    }

    return originalSend.call(this, body);
  };

  next();
};

/**
 * Check if user has reached their rate limit
 */
const checkUsageLimit = async (req, res, next) => {
  if (!supabase || !req.apiKey) {
    return next();
  }

  try {
    // Get usage count for current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.apiKey.userId)
      .gte('created_at', startOfMonth.toISOString());

    const limit = req.apiKey.plan === 'pro' ? 10000 : 100;

    if (count >= limit) {
      return res.status(429).json({
        error: 'Monthly limit reached',
        message: `You have used ${count}/${limit} API calls this month`,
        upgrade_url: 'https://frameops.com/pricing'
      });
    }

    // Add usage info to response headers
    res.set('X-RateLimit-Limit', limit);
    res.set('X-RateLimit-Remaining', Math.max(0, limit - count));
    res.set('X-RateLimit-Reset', new Date(startOfMonth.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString());

    next();
  } catch (error) {
    console.warn('Usage limit check failed:', error.message);
    next(); // Don't block on error
  }
};

module.exports = {
  validateApiKey,
  logApiUsage,
  checkUsageLimit
};
