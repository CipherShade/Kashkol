import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { CompletePhoneForm, SignInForm, SignUpForm } from "@/components/auth/forms";

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
    phone: "Phone number",
    phoneHint: "Stored for contact only.",
    completePhoneAction: "Save phone number",
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

  it("requires a phone on credential sign-up and on social completion", () => {
    for (const html of [
      render(<SignUpForm locale="en" providers={providers} />),
      render(<CompletePhoneForm locale="en" />),
    ]) {
      const input = html.match(/<input[^>]*name="phone"[^>]*>/)?.[0] ?? "";
      expect(input).toContain('type="tel"');
      expect(input).toContain("required");
    }
  });

  it("omits the social block entirely when no provider is enabled", () => {
    const html = render(
      <SignInForm locale="en" providers={{ google: false, facebook: false }} />,
    );

    expect((html.match(/<form\b/g) ?? []).length).toBe(1);
    expect(html).not.toContain('name="provider"');
  });
});
