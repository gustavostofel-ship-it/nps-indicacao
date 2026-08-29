import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// Apaga um usuário de verdade — conta de login (auth.users) + perfil
// (perfis_usuarios, que cai junto via ON DELETE CASCADE). Isso só é possível
// com a service role key (a anon key do client não tem permissão pra mexer
// em auth.users), por isso existe como rota de servidor em vez de uma
// chamada direta do navegador.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from('perfis_usuarios')
    .select('papel')
    .eq('id', user.id)
    .single();

  if (perfil?.papel !== 'admin') {
    return NextResponse.json({ error: 'Apenas administradores podem excluir usuários.' }, { status: 403 });
  }

  if (id === user.id) {
    return NextResponse.json({ error: 'Você não pode excluir sua própria conta.' }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor. Adicione essa variável de ambiente no Vercel (Project Settings → Environment Variables) — o valor fica em Supabase → Project Settings → API → service_role.' },
      { status: 500 }
    );
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { error } = await admin.auth.admin.deleteUser(id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
