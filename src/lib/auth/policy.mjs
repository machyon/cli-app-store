// Password policy shared by the API, the admin UI and the CLI. No imports, so it
// is safe in client bundles. NIST SP 800-63B: favour length over composition rules.
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
