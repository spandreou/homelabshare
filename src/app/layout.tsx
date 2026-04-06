import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppToaster } from "../components/app-toaster";
import { ThemeServiceProvider } from "../components/ThemeServiceProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "homeLabShare - Private Cloud",
  description: "homeLabShare - Private Cloud",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <ThemeServiceProvider>
          {children}
          <div className="pointer-events-none fixed bottom-4 right-4 z-40">
            <p className="rounded-full border border-green-500/40 bg-zinc-950/70 px-4 py-2 text-xs font-medium tracking-wide text-zinc-200 shadow-[0_0_22px_rgba(34,197,94,0.45)] backdrop-blur">
              created by{" "}
              <a
                href="https://github.com/spandreou"
                target="_blank"
                rel="noreferrer"
                className="pointer-events-auto text-green-400 underline decoration-green-500/70 underline-offset-4 transition hover:text-green-300"
              >
                spandreou
              </a>
            </p>
          </div>
          <AppToaster />
        </ThemeServiceProvider>
      </body>
    </html>
  );
}
