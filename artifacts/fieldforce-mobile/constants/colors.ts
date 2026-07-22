/**
 * Design tokens — mirrors the FieldForce Live admin panel palette.
 * Primary action = Vibrant Amber; brand base = Deep Navy.
 */

const colors = {
  light: {
    // legacy aliases
    text: '#0f1b35',
    tint: '#f99207',

    background: '#f3f5f8',       // hsl(216, 20%, 97%)
    foreground: '#0f1b35',       // hsl(222, 47%, 11%) deep navy

    card: '#ffffff',
    cardForeground: '#0f1b35',

    primary: '#f99207',          // hsl(32, 98%, 52%) vibrant amber — action color
    primaryForeground: '#ffffff',

    secondary: '#f0f4f8',        // hsl(210, 40%, 96.1%)
    secondaryForeground: '#0f1b35',

    muted: '#f0f4f8',
    mutedForeground: '#697083',  // hsl(215.4, 16.3%, 46.9%)

    accent: '#f99207',
    accentForeground: '#ffffff',

    destructive: '#f04747',      // hsl(0, 84.2%, 60.2%)
    destructiveForeground: '#ffffff',

    border: '#dce4ef',           // hsl(214.3, 31.8%, 91.4%)
    input: '#dce4ef',

    // Extended brand tokens
    navy: '#0f1b35',             // deep navy — header/sidebar backgrounds
    navyMid: '#1a2d50',          // slightly lighter navy for cards on dark bg
    navyLight: '#243860',        // active states on dark surfaces
    amber: '#f99207',            // same as primary, explicit alias

    // Stop status colours
    success: '#22c55e',          // COMPLETED / REACHED
    warning: '#f99207',          // EN_ROUTE
    danger: '#ef4444',           // PENDING (unvisited)
    neutral: '#94a3b8',          // SKIPPED
  },

  dark: {
    text: '#f8fafc',
    tint: '#f99207',

    background: '#0f1b35',
    foreground: '#f8fafc',

    card: '#131f3c',
    cardForeground: '#f8fafc',

    primary: '#f99207',
    primaryForeground: '#ffffff',

    secondary: '#1e2d4a',
    secondaryForeground: '#f8fafc',

    muted: '#1e2d4a',
    mutedForeground: '#8899bb',

    accent: '#f99207',
    accentForeground: '#ffffff',

    destructive: '#ef4444',
    destructiveForeground: '#ffffff',

    border: '#1e2d4a',
    input: '#1e2d4a',

    navy: '#0f1b35',
    navyMid: '#1a2d50',
    navyLight: '#243860',
    amber: '#f99207',

    success: '#22c55e',
    warning: '#f99207',
    danger: '#ef4444',
    neutral: '#64748b',
  },

  radius: 12,
};

export default colors;
