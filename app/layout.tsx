import "./globals.css";
import { MemoProvider } from "@/app/context/MemoContext"; // Adjust path if needed

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        {/* Wrapping the app in the provider shares the data across all routes */}
        <MemoProvider>
          {children}
        </MemoProvider>
      </body>
    </html>
  );
}