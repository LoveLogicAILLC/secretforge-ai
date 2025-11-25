/**
 * Stripe Integration for Subscription Billing
 * Handles Free, Pro, Team, and Enterprise tiers
 */

export interface StripePlan {
  tier: "free" | "pro" | "team" | "enterprise";
  priceId: string;
  name: string;
  price: number;
  interval: "month" | "year";
  features: string[];
  limits: {
    secrets: number; // -1 for unlimited
    rotations: number; // per month
    apiCalls: number; // per month
    teamMembers: number;
  };
}

export const STRIPE_PLANS: Record<string, StripePlan> = {
  free: {
    tier: "free",
    priceId: "", // No price ID for free tier
    name: "Free",
    price: 0,
    interval: "month",
    features: [
      "10 secrets",
      "Basic encryption",
      "Community support",
      "Email notifications",
    ],
    limits: {
      secrets: 10,
      rotations: 10,
      apiCalls: 100,
      teamMembers: 1,
    },
  },
  pro_monthly: {
    tier: "pro",
    priceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || "price_pro_monthly",
    name: "Pro (Monthly)",
    price: 9,
    interval: "month",
    features: [
      "Unlimited secrets",
      "AI-powered recommendations",
      "Automated rotation",
      "Priority email support",
      "Compliance reports",
    ],
    limits: {
      secrets: -1,
      rotations: -1,
      apiCalls: 10000,
      teamMembers: 1,
    },
  },
  pro_yearly: {
    tier: "pro",
    priceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID || "price_pro_yearly",
    name: "Pro (Yearly)",
    price: 90, // 2 months free
    interval: "year",
    features: [
      "Unlimited secrets",
      "AI-powered recommendations",
      "Automated rotation",
      "Priority email support",
      "Compliance reports",
      "2 months free",
    ],
    limits: {
      secrets: -1,
      rotations: -1,
      apiCalls: 10000,
      teamMembers: 1,
    },
  },
  team_monthly: {
    tier: "team",
    priceId: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID || "price_team_monthly",
    name: "Team (Monthly)",
    price: 49,
    interval: "month",
    features: [
      "Everything in Pro",
      "Up to 10 team members",
      "Shared vaults",
      "Audit logs",
      "Role-based access control",
      "Slack integration",
    ],
    limits: {
      secrets: -1,
      rotations: -1,
      apiCalls: 100000,
      teamMembers: 10,
    },
  },
  team_yearly: {
    tier: "team",
    priceId: process.env.STRIPE_TEAM_YEARLY_PRICE_ID || "price_team_yearly",
    name: "Team (Yearly)",
    price: 490,
    interval: "year",
    features: [
      "Everything in Pro",
      "Up to 10 team members",
      "Shared vaults",
      "Audit logs",
      "Role-based access control",
      "Slack integration",
      "2 months free",
    ],
    limits: {
      secrets: -1,
      rotations: -1,
      apiCalls: 100000,
      teamMembers: 10,
    },
  },
};

export interface StripeConfig {
  apiKey: string;
  webhookSecret: string;
}

/**
 * Stripe service for subscription management
 */
export class StripeService {
  private apiKey: string;
  private webhookSecret: string;
  private baseUrl = "https://api.stripe.com/v1";

  constructor(config: StripeConfig) {
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
  }

  /**
   * Create Stripe customer
   */
  async createCustomer(email: string, name?: string, metadata?: Record<string, string>) {
    const formData = new URLSearchParams({
      email,
      ...(name && { name }),
      ...(metadata &&
        Object.entries(metadata).reduce((acc, [key, value]) => {
          acc[`metadata[${key}]`] = value;
          return acc;
        }, {} as Record<string, string>)),
    });

    const response = await fetch(`${this.baseUrl}/customers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${await response.text()}`);
    }

    return await response.json<any>();
  }

  /**
   * Create subscription
   */
  async createSubscription(customerId: string, priceId: string, trialDays = 14) {
    const formData = new URLSearchParams({
      customer: customerId,
      "items[0][price]": priceId,
      trial_period_days: trialDays.toString(),
      payment_behavior: "default_incomplete",
      "payment_settings[save_default_payment_method]": "on_subscription",
      "expand[0]": "latest_invoice.payment_intent",
    });

    const response = await fetch(`${this.baseUrl}/subscriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${await response.text()}`);
    }

    return await response.json<any>();
  }

  /**
   * Update subscription (upgrade/downgrade)
   */
  async updateSubscription(subscriptionId: string, newPriceId: string) {
    // First, get the current subscription
    const currentSub = await this.getSubscription(subscriptionId);
    const currentItemId = currentSub.items.data[0].id;

    const formData = new URLSearchParams({
      "items[0][id]": currentItemId,
      "items[0][price]": newPriceId,
      proration_behavior: "always_invoice",
    });

    const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${await response.text()}`);
    }

    return await response.json<any>();
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, immediately = false) {
    const url = immediately
      ? `${this.baseUrl}/subscriptions/${subscriptionId}`
      : `${this.baseUrl}/subscriptions/${subscriptionId}`;

    const formData = immediately
      ? new URLSearchParams()
      : new URLSearchParams({ cancel_at_period_end: "true" });

    const response = await fetch(url, {
      method: immediately ? "DELETE" : "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      ...(immediately ? {} : { body: formData }),
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${await response.text()}`);
    }

    return await response.json<any>();
  }

  /**
   * Get subscription
   */
  async getSubscription(subscriptionId: string) {
    const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${await response.text()}`);
    }

    return await response.json<any>();
  }

  /**
   * Get customer
   */
  async getCustomer(customerId: string) {
    const response = await fetch(`${this.baseUrl}/customers/${customerId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${await response.text()}`);
    }

    return await response.json<any>();
  }

  /**
   * Create Stripe Checkout session
   */
  async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    trialDays?: number;
  }) {
    const formData = new URLSearchParams({
      customer: params.customerId,
      "line_items[0][price]": params.priceId,
      "line_items[0][quantity]": "1",
      mode: "subscription",
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      ...(params.trialDays && {
        subscription_data: JSON.stringify({
          trial_period_days: params.trialDays,
        }),
      }),
    });

    const response = await fetch(`${this.baseUrl}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${await response.text()}`);
    }

    return await response.json<any>();
  }

  /**
   * Create Customer Portal session
   */
  async createPortalSession(customerId: string, returnUrl: string) {
    const formData = new URLSearchParams({
      customer: customerId,
      return_url: returnUrl,
    });

    const response = await fetch(`${this.baseUrl}/billing_portal/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${await response.text()}`);
    }

    return await response.json<any>();
  }

  /**
   * Verify webhook signature
   */
  async verifyWebhook(payload: string, signature: string): Promise<any> {
    // Stripe webhook signature verification
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(this.webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureParts = signature.split(",");
    const timestamp = signatureParts
      .find((part) => part.startsWith("t="))
      ?.substring(2);
    const signatureHash = signatureParts
      .find((part) => part.startsWith("v1="))
      ?.substring(3);

    if (!timestamp || !signatureHash) {
      throw new Error("Invalid signature format");
    }

    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );

    const expectedHex = Array.from(new Uint8Array(expectedSignature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (expectedHex !== signatureHash) {
      throw new Error("Invalid signature");
    }

    // Check timestamp (prevent replay attacks)
    const now = Math.floor(Date.now() / 1000);
    const timestampNum = parseInt(timestamp);
    if (now - timestampNum > 300) {
      // 5 minutes
      throw new Error("Timestamp too old");
    }

    return JSON.parse(payload);
  }

  /**
   * Record usage event (for metered billing)
   */
  async recordUsage(subscriptionItemId: string, quantity: number, timestamp?: number) {
    const formData = new URLSearchParams({
      quantity: quantity.toString(),
      ...(timestamp && { timestamp: timestamp.toString() }),
    });

    const response = await fetch(`${this.baseUrl}/subscription_items/${subscriptionItemId}/usage_records`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${await response.text()}`);
    }

    return await response.json<any>();
  }
}

/**
 * Get plan by tier and interval
 */
export function getPlan(tier: string, interval: "month" | "year" = "month"): StripePlan {
  const key = tier === "free" ? "free" : `${tier}_${interval}ly`;
  return STRIPE_PLANS[key];
}

/**
 * Get all available plans
 */
export function getAllPlans(): StripePlan[] {
  return Object.values(STRIPE_PLANS);
}
