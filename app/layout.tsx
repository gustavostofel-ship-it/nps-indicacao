import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { createClient } from '@/lib/supabase/server';
import { Navbar } from '@/components/Navbar';
import { Toaster } from 'react-hot-toast';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Girow',
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
    <html lang="pt-BR" className={inter.variable}>
      <body className="bg-slate-50 min-h-screen flex flex-col font-sans text-slate-800" suppressHydrationWarning>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        {!isSupabaseConfigured && (
          <div className="bg-red-600 text-white p-3 text-sm text-center font-medium">
            Atenção: Credenciais do Supabase não configuradas (NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY). O app não funcionará corretamente. Configure na aba Secrets/Settings.
          </div>
        )}
        {user && <Navbar isAdmin={isAdmin} userName={userName} />}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}