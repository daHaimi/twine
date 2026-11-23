import styles from './AppFooter.module.css'

/**
 * Site-wide footer: reassurance that TWINE is free and privacy-friendly,
 * plus an optional PayPal "buy me a coffee" link. Rendered by the app shell
 * on every route; the `twine-app-chrome` class hides it when printing.
 */
export function AppFooter() {
  return (
    <footer className={`${styles.footer} twine-app-chrome`}>
      <p className={styles.statement}>
        TWINE is free to use. We do not collect any data and do not employ any ads.
      </p>
      <p className={styles.request}>
        If you like it, please buy me a coffee.
      </p>
      <div className={styles.links}>
        <a
          className={styles.coffeeButton}
          href="https://www.paypal.me/tungavp"
          target="_blank"
          rel="noopener noreferrer"
          title="Opens PayPal in a new tab"
        >
          <span aria-hidden="true">☕</span> Buy me a coffee
        </a>
        <a
          className={styles.githubLink}
          href="https://github.com/daHaimi/twine"
          target="_blank"
          rel="noopener noreferrer"
          title="Opens the TWINE repository on GitHub in a new tab"
        >
          Available on GitHub
        </a>
      </div>
    </footer>
  )
}
