// Presentation metadata + status semantics for AI research providers, shared by
// the first-run wizard, the settings screen, and the status banner so all three
// agree on labels, fix hints, and what "available / signed out / not installed"
// means. Backend availability comes from /api/health; this maps it to UI copy.

export const PROVIDER_META = {
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    tagline: 'Recommended - Free',
    recommended: true,
    blurb:
      'Sign in with your Google account in the browser - no API key. Free tier ~60 requests/min, 1,000/day.',
    signInSteps:
      'Run gemini once in your terminal and choose "Login with Google" - a browser window opens to sign in.',
    installHint: 'Install the Gemini CLI, run gemini once and choose "Login with Google".',
    signedOutHint: 'Run gemini and choose "Login with Google".'
  },
  claude: {
    id: 'claude',
    label: 'Claude Code',
    tagline: null,
    recommended: false,
    blurb: 'Uses your local Claude Code CLI (claude login).',
    signInSteps: 'Run claude login in your terminal - a browser window opens to sign in.',
    installHint: 'Install the Claude Code CLI, run claude login, and make sure claude is on your PATH.',
    signedOutHint: 'Run claude login.'
  }
};

export const PROVIDER_ORDER = ['gemini', 'claude'];

export const STATUS_LABEL = {
  ready: 'Ready',
  signed_out: 'Signed out',
  not_installed: 'Not installed',
  unknown: 'Unknown'
};

// Map a /api/health provider entry ({ available, authenticated, error }) to a
// single UI status. `authenticated` is null when a provider can't detect
// sign-in (Claude), so only an explicit false counts as signed out.
export function deriveStatus(entry) {
  if (!entry) return 'unknown';
  if (!entry.available) return 'not_installed';
  if (entry.authenticated === false) return 'signed_out';
  return 'ready';
}

export function providerEntry(health, id) {
  return health?.providers?.find((p) => p.id === id) ?? null;
}

export function statusHint(id, status) {
  const meta = PROVIDER_META[id];
  if (!meta) return '';
  if (status === 'not_installed') return meta.installHint;
  if (status === 'signed_out') return meta.signedOutHint;
  return '';
}

// Whether a research_error reads like a provider/auth problem (vs a transient
// timeout or bad model output), so the UI can point the user at Settings.
export function looksLikeProviderError(error) {
  if (!error) return false;
  return /provider|not available|not installed|sign(ed)?[\s-]?(in|out)|log[\s-]?in|auth|configured|credential|quota/i.test(
    error
  );
}
