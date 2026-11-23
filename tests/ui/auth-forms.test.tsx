import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { SignInForm, SignUpForm } from "@/components/auth/forms";
import { SubscriptionPanel } from "@/components/auth/subscription-panel";

/**
 * A `<form>` inside a `<form>` is invalid HTML. The browser parser drops the
 * inner form element, so its hidden inputs and submit button become part of the
 * outer form: "Continue with Google" then posts the credential action with an
 * empty email instead of starting OAuth, and the user sees nothing happen.
 *
 * The social block must therefore be a sibling of the credential form. These
 * tests render the real components and reject any nesting.
 */
const messages = {
  Auth: {
    email: "Email",
    password: "Password",
    name: "Name",
    confirmPassword: "Confirm password",
    passwordHint: "At least 10 characters",
    signInAction: "Sign in",
    signUpAction: "Create account",
    socialDivider: "or",
    continueWithGoogle: "Continue with Google",
    continueWithFacebook: "Continue with Facebook",
    forgotPassword: "Forgot your password?",
    noAccount: "Do not have an account?",
    createAccount: "Create one",
    haveAccount: "Already have an account?",
    subscription: {
      title: "How to Subscribe & Activate",
      planTitle: "Monthly Kashkol Subscription",
      price: "249",
      currency: "EGP",
      period: "per month",
      step1: "Create your account.",
      step2: "Pay via InstaPay.",
      step3: "Keep the receipt.",
      instapayId: "youssefahmed.telda@instapay",
      payButton: "Pay via direct InstaPay link",
      qrAlt: "InstaPay QR Code",
      note: "The receipt is confirmed manually.",
    },
  },
};

/** Maximum form nesting depth found in the markup (1 means never nested). */
function maxFormDepth(html: string): number {
  let depth = 0;
  let max = 0;
  for (const tag of html.match(/<\/?form\b/g) ?? []) {
    depth += tag === "</form" ? -1 : 1;
    max = Math.max(max, depth);
  }
  return max;
}

function render(ui: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("credential and social forms never nest", () => {
  const providers = { google: true, facebook: true };

  it("keeps every form on the sign-in screen at depth one", () => {
    const html = render(<SignInForm locale="en" providers={providers} />);

    expect(maxFormDepth(html)).toBe(1);
    // Credential form plus one sibling form per enabled provider.
    expect((html.match(/<form\b/g) ?? []).length).toBe(3);
    expect((html.match(/<\/form>/g) ?? []).length).toBe(3);
  });

  it("keeps every form on the sign-up screen at depth one", () => {
    const html = render(<SignUpForm locale="en" providers={providers} />);

    expect(maxFormDepth(html)).toBe(1);
    expect((html.match(/<form\b/g) ?? []).length).toBe(3);
    expect((html.match(/<\/form>/g) ?? []).length).toBe(3);
  });

  it("gives the provider input its own form on the sign-in screen", () => {
    const html = render(<SignInForm locale="en" providers={providers} />);
    const providerForm = html.indexOf('name="provider" value="google"');

    expect(providerForm).toBeGreaterThan(-1);
    // The nearest preceding form tag is an opening one, so the hidden input is
    // in its own form rather than after a closing tag inside another form.
    const preceding = html.lastIndexOf("<form", providerForm);
    const precedingClose = html.lastIndexOf("</form>", providerForm);
    expect(preceding).toBeGreaterThan(precedingClose);
  });

  it("omits the social block entirely when no provider is enabled", () => {
    const html = render(
      <SignInForm locale="en" providers={{ google: false, facebook: false }} />,
    );

    expect((html.match(/<form\b/g) ?? []).length).toBe(1);
    expect(html).not.toContain('name="provider"');
  });
});

describe("step-two payment panel", () => {
  it("shows the real InstaPay link and QR, and never claims automatic activation", () => {
    const html = render(<SubscriptionPanel locale="en" />);

    expect(html).toContain("https://ipn.eg/S/youssefahmed.telda/instapay/2PusEP");
    expect(html).toContain("landing%2Finstapay-qr.jpg");
    expect(html).toContain("The receipt is confirmed manually.");
    expect(html).not.toContain("activated upon payment confirmation");
    expect(html).not.toContain("<form");
  });

  it("uses Arabic step numbers for the Arabic locale", () => {
    const html = render(<SubscriptionPanel locale="ar" />);

    expect(html).toContain(">١<");
    expect(html).toContain(">٢<");
    expect(html).toContain(">٣<");
  });
});
