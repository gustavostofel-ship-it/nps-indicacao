import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import { redirect } from 'next/navigation';
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
  // getSession() lê o usuário do cookie sem chamar o servidor de Auth do
  // Supabase pela rede — usar getUser() (que faz essa chamada) aqui seria
  // redundante, já que o middleware já validou o token de forma autoritativa
  // em toda navegação antes desta layout rodar. Isso tirava uma chamada de
  // rede inteira de cada troca de aba, que era a maior causa da lentidão.
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  let isAdmin = false;
  let userName = '';
  
  if (user) {
    const { data: perfil } = await supabase
      .from('perfis_usuarios')
      .select('papel, nome, status')
      .eq('id', user.id)
      .single();

    // Admin pode "inativar" um usuário em Configurações — isso precisa
    // realmente bloquear o acesso, não só ficar cosmético na listagem.
    // Derruba a sessão dele na primeira navegação depois de inativado.
    if (perfil && perfil.status !== 'ativo') {
      await supabase.auth.signOut();
      redirect('/login?motivo=inativo');
    }

    isAdmin = perfil?.papel === 'admin';
    userName = perfil?.nome || user.email;
  }

  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className={`min-h-screen flex flex-col font-sans text-slate-800 ${user ? 'bg-slate-50' : 'bg-[#070f1f]'}`} suppressHydrationWarning>
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        {!isSupabaseConfigured && (
          <div className="bg-red-600 text-white p-3 text-sm text-center font-medium">
            Atenção: Credenciais do Supabase não configuradas (NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY). O app não funcionará corretamente. Configure na aba Secrets/Settings.
          </div>
        )}
        {user && <Navbar isAdmin={isAdmin} userName={userName} />}
        {user ? (
          <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        ) : (
          <main className="flex-1 w-full">
            {children}
          </main>
        )}
      </body>
    </html>
  );
}