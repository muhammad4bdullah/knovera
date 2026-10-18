import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Knovera — Connected learning for every classroom",
  description:
    "Connect curriculum, assessment and learning with Knovera, an education intelligence workspace.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
