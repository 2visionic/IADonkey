import React, { useState, useEffect } from 'react';

interface MaterialIconProps {
  icon?: string | null;
  image?: string | null;
  location?: string | null;
  className?: string;
  fallbackIcon?: string;
  size?: number | string;
  colorClass?: string;
}

function getOrigin(url?: string | null): string | null {
  if (!url) return null;
  try {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return null;
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return null;
  }
}

export const MaterialIcon: React.FC<MaterialIconProps> = ({
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
  const [cachedFavicon, setCachedFavicon] = useState<string | null>(() => {
    if (origin) {
      return localStorage.getItem(`favicon:${origin}`);
    }
    return null;
  });

  useEffect(() => {
    setImgError(false);
  }, [image, location]);

  useEffect(() => {
    if (!origin) return;
    const current = localStorage.getItem(`favicon:${origin}`);
    if (current !== cachedFavicon) {
      setCachedFavicon(current);
    }

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.origin === origin) {
        setCachedFavicon(detail.dataUrl);
        setImgError(false);
      }
    };

    window.addEventListener('favicon-cached', handler);
    return () => window.removeEventListener('favicon-cached', handler);
  }, [origin, cachedFavicon]);

  // Determine effective image src
  let effectiveSrc: string | null = null;
  if (isFaviconPlaceholder) {
    effectiveSrc = cachedFavicon;
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
};

