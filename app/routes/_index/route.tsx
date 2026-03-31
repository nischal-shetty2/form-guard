import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.badge}>Free Shopify App</div>
        <h1 className={styles.heading}>
          Block contact form <span className={styles.highlight}>spam</span>
          <br />
          before it reaches you
        </h1>
        <p className={styles.subheading}>
          FormGuard stops bots and spam submissions on your Shopify contact form
          with 3 invisible layers of protection. No captcha. No friction for
          your customers.
        </p>
        <a
          href="https://apps.shopify.com/formguard"
          className={styles.cta}
        >
          Install Free
        </a>
        <p className={styles.price}>Free forever. No hidden charges.</p>

        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
      </section>

      {/* Screenshots */}
      <section className={styles.screenshots}>
        <img
          src="/listing1.png"
          alt="FormGuard admin dashboard showing spam stats and blocked keywords"
          className={styles.screenshotLarge}
        />
        <img
          src="/blocked1.png"
          alt="Contact form with spam submission being blocked"
          className={styles.screenshotSmall}
        />
      </section>

      {/* Features */}
      <section className={styles.features}>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>&#129302;</div>
          <h3 className={styles.featureTitle}>Honeypot Detection</h3>
          <p className={styles.featureDesc}>
            An invisible field that catches automated bots filling every input.
            Humans never see it, bots always fill it.
          </p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>&#9202;</div>
          <h3 className={styles.featureTitle}>Time-Based Filtering</h3>
          <p className={styles.featureDesc}>
            Blocks submissions made faster than a human can type. If the form is
            submitted in under 2 seconds, it's spam.
          </p>
        </div>
        <div className={styles.feature}>
          <div className={styles.featureIcon}>&#128683;</div>
          <h3 className={styles.featureTitle}>Keyword Blocking</h3>
          <p className={styles.featureDesc}>
            Define your own list of blocked words. Any message containing them
            is stopped before it reaches your inbox.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className={styles.howSection}>
        <h2 className={styles.howTitle}>Up and running in 60 seconds</h2>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNumber}>1</div>
            <p className={styles.stepText}>Install FormGuard from the Shopify App Store</p>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>2</div>
            <p className={styles.stepText}>Enable the app embed in your theme settings</p>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>3</div>
            <p className={styles.stepText}>Add blocked keywords and you're protected</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <ul className={styles.footerLinks}>
          <li><a href="/privacy">Privacy Policy</a></li>
          <li><a href="mailto:nischal.shetty02@gmail.com">Support</a></li>
        </ul>
      </footer>
    </div>
  );
}
