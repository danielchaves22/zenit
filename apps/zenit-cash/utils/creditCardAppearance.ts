export const DEFAULT_CREDIT_CARD_COLOR = '#1D4ED8';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function withAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexToRgb(hex);

  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function getRelativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const [red, green, blue] = [r, g, b].map((channel) => {
    const normalized = channel / 255;

    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function normalizeHexColor(value?: string | null, fallback = DEFAULT_CREDIT_CARD_COLOR) {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();

  if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return fallback;
  }

  return trimmed.toUpperCase();
}

export function mixHexColors(primary: string, secondary: string, ratio: number) {
  const safeRatio = clamp(ratio, 0, 1);
  const source = hexToRgb(normalizeHexColor(primary));
  const target = hexToRgb(normalizeHexColor(secondary, secondary));

  return rgbToHex(
    source.r + (target.r - source.r) * safeRatio,
    source.g + (target.g - source.g) * safeRatio,
    source.b + (target.b - source.b) * safeRatio
  );
}

export function getCreditCardTheme(cardColor?: string | null) {
  const baseColor = normalizeHexColor(cardColor);
  const isLight = getRelativeLuminance(baseColor) > 0.62;

  return {
    baseColor,
    isLight,
    cardStyle: {
      background: `linear-gradient(135deg, ${mixHexColors(baseColor, '#FFFFFF', 0.16)} 0%, ${baseColor} 42%, ${mixHexColors(baseColor, '#020617', 0.42)} 100%)`,
      borderColor: mixHexColors(baseColor, isLight ? '#0F172A' : '#FFFFFF', isLight ? 0.18 : 0.22),
      boxShadow: `0 24px 48px -28px ${withAlpha(baseColor, 0.45)}`
    },
    panelStyle: {
      backgroundColor: isLight ? withAlpha('#FFFFFF', 0.72) : withAlpha('#020617', 0.22),
      borderColor: isLight ? withAlpha('#0F172A', 0.12) : withAlpha('#FFFFFF', 0.12)
    },
    primaryTextColor: isLight ? '#0F172A' : '#FFFFFF',
    secondaryTextColor: isLight ? withAlpha('#0F172A', 0.78) : withAlpha('#FFFFFF', 0.84),
    tertiaryTextColor: isLight ? withAlpha('#0F172A', 0.62) : withAlpha('#FFFFFF', 0.68),
    actionClassName: isLight
      ? 'border-slate-900/15 bg-white/55 text-slate-900 hover:bg-white/80 hover:border-slate-900/25 hover:text-slate-950'
      : 'border-white/15 bg-black/10 text-white hover:bg-black/25 hover:border-white/20 hover:text-white',
    destructiveActionClassName: isLight
      ? 'border-red-900/15 bg-white/55 text-red-900 hover:bg-white/80 hover:text-red-950'
      : 'border-red-200/20 bg-black/10 text-red-100 hover:bg-black/25 hover:text-white'
  };
}
