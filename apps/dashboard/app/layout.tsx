import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import { AppShell } from '@/components/app-shell';
import { ToastProvider } from '@/components/ui/toast';
import { ErrorBoundary } from '@/components/error-boundary';
export const metadata={title:'PowerChain Staking',description:'Stake PWRC. Participate in governance and network assurance.'};

function Document({children}:{children:React.ReactNode}){
  return <html lang="en"><body><ToastProvider><ErrorBoundary><AppShell>{children}</AppShell></ErrorBoundary></ToastProvider></body></html>;
}
export default function RootLayout({children}:{children:React.ReactNode}){
  const mode=process.env.NEXT_PUBLIC_AUTH_PROVIDER??'clerk';
  const document=<Document>{children}</Document>;
  if(mode==='better-auth') return document;
  return <ClerkProvider signInUrl="/login" signUpUrl="/login">{document}</ClerkProvider>;
}
