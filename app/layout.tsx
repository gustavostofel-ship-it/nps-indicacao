import type {Metadata} from 'next';
import './globals.css';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { LogoutButton } from '@/components/LogoutButton';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'NPS & Indicações',
  description: 'Registro de avaliações e acompanhamento de indicações',
};

export default async function RootLayout({children}: {children: React.ReactNode}) {
  const isSupabaseConfigured = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let isAdmin = false;
  let userName = '';
  
  if (user) {
    const { data: perfil } = await supabase
      .from('perfis_usuarios')
      .select('papel, nome')
      .eq('id', user.id)
      .single();
    
    isAdmin = perfil?.papel === 'admin';
    userName = perfil?.nome || user.email;
  }

  return (
    <html lang="pt-BR">
      <body className="bg-slate-50 min-h-screen flex flex-col font-sans text-slate-800" suppressHydrationWarning>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        {!isSupabaseConfigured && (
          <div className="bg-red-600 text-white p-3 text-sm text-center font-medium">
            Atenção: Credenciais do Supabase não configuradas (NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY). O app não funcionará corretamente. Configure na aba Secrets/Settings.
          </div>
        )}
        {user && (
          <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
              <div className="flex items-center gap-8">
                <h1 className="text-xl font-bold text-blue-600 tracking-tight">NPS & Indicações</h1>
                <nav className="flex items-center gap-6">
                  <Link href="/" className="text-slate-600 hover:text-blue-600 font-medium transition-colors">
                    Atendimento
                  </Link>
                  {isAdmin && (
                    <Link href="/config" className="text-slate-600 hover:text-blue-600 font-medium transition-colors">
                      Configurações
                    </Link>
                  )}
                </nav>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-500 hidden sm:inline-block font-medium">Olá, {userName}</span>
                <LogoutButton />
              </div>
            </div>
          </header>
        )}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
