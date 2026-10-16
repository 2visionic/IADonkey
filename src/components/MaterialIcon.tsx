import React, { useState, useEffect } from 'react';
import magicgateIcon from '../assets/magicgate-icon.png';

interface MaterialIconProps {
  icon?: string | null;
  image?: string | null;
  location?: string | null;
  className?: string;
  fallbackIcon?: string;
  size?: number | string;
  colorClass?: string;
}

const originMemoryCache = new Map<string, string | null>();
const faviconMemoryCache = new Map<string, string | null>();

if (typeof window !== 'undefined') {
  window.addEventListener('favicon-cached', (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail && detail.origin && detail.dataUrl) {
      faviconMemoryCache.set(detail.origin, detail.dataUrl);
    }
  });
}

function getOrigin(url?: string | null): string | null {
  if (!url) return null;
  const cached = originMemoryCache.get(url);
  if (cached !== undefined) return cached;
  try {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      originMemoryCache.set(url, null);
      return null;
    }
    const parsed = new URL(trimmed);
    originMemoryCache.set(url, parsed.origin);
    return parsed.origin;
  } catch {
    originMemoryCache.set(url, null);
    return null;
  }
}

function getCachedFavicon(origin: string | null): string | null {
  if (!origin) return null;
  const mem = faviconMemoryCache.get(origin);
  if (mem !== undefined) return mem;
  try {
    const val = localStorage.getItem(`favicon:${origin}`);
    faviconMemoryCache.set(origin, val);
    return val;
  } catch {
    faviconMemoryCache.set(origin, null);
    return null;
  }
}

export const MaterialIcon: React.FC<MaterialIconProps> = React.memo(({
  icon,
  image,
  location,
  className = 'w-6 h-6',
  fallbackIcon = 'code',
  size,
  colorClass,
}) => {
  const [imgError, setImgError] = useState(false);
  const isFaviconPlaceholder = image === '{favicon}';
  const origin = isFaviconPlaceholder ? getOrigin(location) : null;
  const [cachedFavicon, setCachedFavicon] = useState<string | null>(() => getCachedFavicon(origin));

  useEffect(() => {
    setImgError(false);
  }, [image, location]);

  useEffect(() => {
    if (!origin) {
      if (cachedFavicon !== null) setCachedFavicon(null);
      return;
    }
    const current = getCachedFavicon(origin);
    if (current !== cachedFavicon) {
      setCachedFavicon(current);
    }

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.origin === origin) {
        faviconMemoryCache.set(origin, detail.dataUrl);
        setCachedFavicon(detail.dataUrl);
        setImgError(false);
      }
    };

    window.addEventListener('favicon-cached', handler);
    return () => window.removeEventListener('favicon-cached', handler);
  }, [origin]);

  // Determine effective image src
  let effectiveSrc: string | null = null;
  if (isFaviconPlaceholder) {
    effectiveSrc = cachedFavicon;
  } else if (image === './assets/magicgate-icon.png' || image === '/assets/magicgate-icon.png') {
    effectiveSrc = magicgateIcon;
  } else if (image && image !== '{favicon}') {
    effectiveSrc = image;
  }

  // If effective image is provided and hasn't failed to load, render the image
  if (effectiveSrc && !imgError) {
    return (
      <img
        src={effectiveSrc}
        alt="item icon"
        className={`${className} object-contain rounded shrink-0 m-auto block`}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback to Material Symbol icon
  const iconName = icon?.trim() || fallbackIcon;

  // Determine font size adaptively based on size prop or className dimensions
  let effectiveFontSize = '24px';
  if (size) {
    effectiveFontSize = typeof size === 'number' ? `${size}px` : size;
  } else if (className?.includes('w-4') || className?.includes('h-4')) {
    effectiveFontSize = '14px';
  } else if (className?.includes('w-5') || className?.includes('h-5')) {
    effectiveFontSize = '16px';
  } else if (className?.includes('w-7') || className?.includes('h-7')) {
    effectiveFontSize = '26px';
  } else if (className?.includes('w-6') || className?.includes('h-6')) {
    effectiveFontSize = '20px';
  }

  return (
    <span
      className={`material-symbols-outlined select-none ${colorClass || 'text-indigo-400'} ${className} !flex items-center justify-center text-center leading-none shrink-0 m-auto`}
      style={{
        fontSize: effectiveFontSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        lineHeight: 1,
      }}
    >
      {iconName}
    </span>
  );
});

