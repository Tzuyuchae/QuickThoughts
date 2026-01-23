"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Folder, Mic } from "lucide-react";
import type { ComponentType } from "react";

function NavItem({ href, label, Icon }: { href: string; label: string; Icon: ComponentType<{ className?: string }> }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
        isActive
          ? "bg-gray-200 font-medium"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      {/* Desktop Layout */}
      <div className="mx-auto grid max-w-6xl grid-cols-1 md:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <aside className="hidden md:block border-r px-4 py-6">
          <Link href="/" className="text-lg font-semibold">
            Quick Thoughts
          </Link>

          <nav className="mt-6 space-y-1">
            <NavItem href="/" label="Home" Icon={Home} />
            <NavItem href="/folders" label="Folders" Icon={Folder} />
          </nav>

          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
            >
              <Mic className="mr-2 h-4 w-4" />
              Record
            </Link>
          </div>
        </aside>

        {/* Main Content */}
        <main className="px-4 py-6 md:px-8">
          <header className="mb-6">
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-gray-500">
              Capture and organize your thoughts
            </p>
          </header>

          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 border-t bg-white md:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-around px-4 py-2">
          <Link href="/" className="flex flex-col items-center text-xs text-gray-700">
            <Home className="h-5 w-5" />
            Home
          </Link>

          <Link
            href="/"
            className="flex -translate-y-4 items-center justify-center rounded-full bg-black p-3 text-white shadow"
          >
            <Mic className="h-5 w-5" />
          </Link>

          <Link
            href="/folders"
            className="flex flex-col items-center text-xs text-gray-700"
          >
            <Folder className="h-5 w-5" />
            Folders
          </Link>
        </div>
      </nav>

      {/* Spacer for mobile nav */}
      <div className="h-16 md:hidden" />
    </div>
  );
}
