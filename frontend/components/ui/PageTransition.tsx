// frontend/components/ui/PageTransition.tsx
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export function PageTransition() {
  const [isChangingRoute, setIsChangingRoute] = useState(false);
  const router = useRouter();
  
  useEffect(() => {
    const handleStart = () => setIsChangingRoute(true);
    const handleComplete = () => setIsChangingRoute(false);
    
    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleComplete);
    
    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleComplete);
    };
  }, [router]);
  
  if (!isChangingRoute) return null;
  
  return (
    <div className="fixed top-0 left-0 w-full z-50">
      <div className="h-1 bg-[#f59e0b] animate-[loading_2s_ease-in-out_infinite]"></div>
    </div>
  );
}