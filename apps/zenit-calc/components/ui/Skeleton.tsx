// frontend/components/ui/Skeleton.tsx
import React from 'react';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`bg-neutral animate-pulse ${className}`} />;
}
