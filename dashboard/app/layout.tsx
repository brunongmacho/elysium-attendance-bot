import type { Metadata } from "next";
import { Cinzel, Cinzel_Decorative } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import { LayoutContent } from "@/components/LayoutContent";
import { THEME_COLORS } from "@/lib/theme-constants";

// Fantasy RPG-style fonts for Lordnine Infinite Class theme
const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  weight: ["400", "600", "700", "900"],
  display: "swap",
});

const cinzelDecorative = Cinzel_Decorative({
  subsets: ["latin"],
  variable: "--font-cinzel-decorative",
  weight: ["400", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Elysium Dashboard - Guild Management",
  description: "Real-time guild management and member tracking for Elysium guild members",
  keywords: "Elysium, guild, leaderboard, dashboard",
  authors: [{ name: "Elysium Guild" }],
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon.png', type: 'image/png', sizes: '256x256' },
    ],
    apple: [
      { url: '/icon.png', sizes: '256x256', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cinzel.variable} ${cinzelDecorative.variable}`}>
      <head>
        {/* Resource Hints for Performance */}
        <link rel="dns-prefetch" href="https://cdn.discordapp.com" />
        <link rel="preconnect" href="https://cdn.discordapp.com" crossOrigin="anonymous" />

        {/* Prevent theme flash by injecting theme CSS before any other styles */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const themes = ${JSON.stringify(THEME_COLORS)};

                  const savedTheme = localStorage.getItem('guild-theme') || 'crimson';
                  const theme = themes[savedTheme] || themes.crimson;

                  // Inject inline style tag with CSS variables - executes before external CSS
                  const style = document.createElement('style');
                  style.innerHTML = \`:root {
                    --color-primary: \${theme.primary};
                    --color-primary-dark: \${theme.primaryDark};
                    --color-primary-light: \${theme.primaryLight};
                    --color-accent: \${theme.accent};
                    --color-accent-dark: \${theme.accentDark};
                    --color-accent-light: \${theme.accentLight};
                    --color-success: \${theme.success};
                    --color-warning: \${theme.warning};
                    --color-danger: \${theme.danger};
                    --color-info: \${theme.info};
                  }\`;
                  document.head.appendChild(style);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased font-game min-h-screen flex flex-col">
        <Providers>
          <LayoutContent>{children}</LayoutContent>
        </Providers>
      </body>
    </html>
  );
}
