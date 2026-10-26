// Loads Google Analytics 4. Rendered ONLY after the visitor has accepted
// analytics (see app/(public)/layout.tsx), so without consent Google's script
// is never even downloaded.
//
// GA4's "enhanced measurement" (on by default in GA) counts page views when
// the address changes, so moving between pages inside the site is counted
// too, without extra code here.
import Script from "next/script";

export default function GoogleAnalytics({ id }: { id: string }) {
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
gtag('config', '${id}', { allow_google_signals: false, allow_ad_personalization_signals: false });`}
      </Script>
    </>
  );
}
