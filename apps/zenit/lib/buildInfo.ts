// frontend/lib/buildInfo.ts
export const BUILD_INFO = {
  API_URL: process.env.NEXT_PUBLIC_API_URL,
  NODE_ENV: process.env.NODE_ENV,
  BUILD_TIME: new Date().toISOString(),
};

// Log durante o build
console.log('🏗️ [BUILD] Build info:', BUILD_INFO);