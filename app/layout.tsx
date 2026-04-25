export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
      </head>
      <body>
        <div 
          className="cf-turnstile" 
          data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} 
          data-size="invisible"
        ></div>
        {children}
      </body>
    </html>
  );
}
