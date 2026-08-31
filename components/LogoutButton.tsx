'use client';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <button 
      onClick={handleLogout}
      className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
      title="Sair"
    >
      <LogOut className="w-5 h-5" />
    </button>
  );
}
