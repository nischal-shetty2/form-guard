import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

const TITLE = "FormGuard — Block Shopify contact form spam";
const DESCRIPTION =
  "FormGuard stops automated spam on your Shopify contact form with three invisible checks. No captcha, no friction for your customers, free forever.";

export const meta: MetaFunction = () => [
  { title: TITLE },
  { name: "description", content: DESCRIPTION },
  { property: "og:title", content: TITLE },
  { property: "og:description", content: DESCRIPTION },
  { property: "og:type", content: "website" },
  { property: "og:image", content: "/listing1.png" },
  { name: "twitter:card", content: "summary_large_image" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
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
          FormGuard stops automated spam on your Shopify contact form with three
          invisible checks. No captcha. No friction for your customers.
        </p>
        <a href="https://apps.shopify.com/formguard" className={styles.cta}>
          Install Free
        </a>
        <p className={styles.price}>Free forever. No hidden charges.</p>
      </section>

      {/* Screenshots */}
      <section className={styles.screenshots}>
        <img
          src="/listing1.png"
          alt="FormGuard admin dashboard showing spam stats and blocked keywords"
          className={styles.screenshotLarge}
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
          <h3 className={styles.featureTitle}>Behaviour Checks</h3>
          <p className={styles.featureDesc}>
            Blocks submissions that arrive faster than a human can type, or with
            no typing or clicking on the form at all.
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

      {/* Video demo */}
      <section className={styles.videoSection}>
        <h2 className={styles.videoTitle}>See it in action</h2>
        <div className={styles.videoWrapper}>
          <iframe
            src="https://www.youtube-nocookie.com/embed/_OeQXkoRNz8"
            title="FormGuard demo"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className={styles.videoIframe}
          />
        </div>
      </section>

      {/* How it works */}
      <section className={styles.howSection}>
        <h2 className={styles.howTitle}>Up and running in 60 seconds</h2>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNumber}>1</div>
            <p className={styles.stepText}>
              Install FormGuard from the Shopify App Store
            </p>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>2</div>
            <p className={styles.stepText}>
              Enable the app embed in your theme settings
            </p>
          </div>
          <div className={styles.step}>
            <div className={styles.stepNumber}>3</div>
            <p className={styles.stepText}>
              Add blocked keywords and you&apos;re protected
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <ul className={styles.footerLinks}>
          <li>
            <a href="/privacy">Privacy Policy</a>
          </li>
          <li>
            <a href="/auth/login">Merchant login</a>
          </li>
          <li>
            <a href="mailto:shettynick2@gmail.com">Support</a>
          </li>
        </ul>
      </footer>
    </div>
  );
}
