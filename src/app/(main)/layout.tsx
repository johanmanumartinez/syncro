import Link from "next/link";
import { getUser } from "@/lib/auth";
import { signOut } from "@/app/(main)/login/actions";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  return (
    <>
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            <span className="text-indigo-600">●</span> Syncro
          </Link>
          {user && (
            <nav className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
              <Link href="/library" className="hover:text-foreground">Galería</Link>
              <Link href="/record" className="hover:text-foreground">Grabar</Link>
              <Link href="/meetings" className="hover:text-foreground">Reuniones</Link>
            </nav>
          )}
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="hidden text-zinc-500 sm:inline">{user.email}</span>
                <form action={signOut}>
                  <button className="btn-ghost">Salir</button>
                </form>
              </>
            ) : (
              <Link href="/login" className="btn-primary">Entrar</Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
