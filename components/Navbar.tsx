'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { LogoutButton } from '@/components/LogoutButton';

export function Navbar({ isAdmin, userName }: { isAdmin: boolean, userName: string }) {
  const [open, setOpen] = useState(false);

  const links = [
    { href: '/', label: 'Dashboard' },
    { href: '/atendimento', label: 'Atendimento' },
    { href: '/indicacoes', label: 'Indicações' },
    ...(isAdmin ? [{ href: '/config', label: 'Configurações' }] : []),
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <h1 className="text-xl font-bold text-blue-600 tracking-tight">Girow</h1>
          <nav className="hidden md:flex items-center gap-6">
            {links.map(link => (
              <Link key={link.href} href={link.href} className="text-slate-600 hover:text-blue-600 font-medium transition-colors">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500 hidden sm:inline-block font-medium">Olá, {userName}</span>
          <div className="hidden md:block">
            <LogoutButton />
          </div>
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 -mr-2 text-slate-600 hover:text-blue-600"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
          >
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-slate-700 hover:bg-slate-50 hover:text-blue-600 font-medium transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between px-3">
            <span className="text-sm text-slate-500 font-medium">Olá, {userName}</span>
            <LogoutButton />
          </div>
        </nav>
      )}
    </header>
  );
}