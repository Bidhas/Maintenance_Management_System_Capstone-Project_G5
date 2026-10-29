// Google sign-in verification — the ONLY place that talks to Google.
//
// Flow: the browser's "Sign in with Google" button hands the page a signed ID token (a JWT).
// The page posts it to POST /api/auth/google. We verify it HERE, on the server:
//   • signature is Google's, token not expired      (OAuth2Client.verifyIdToken does this)
//   • audience == OUR client id                      (token was issued for our app, not someone else's)
//   • email_verified is true
//   • email domain is the college's (and, for Workspace accounts, the "hd" claim matches)
// We never trust an email address sent by the browser — only the verified token's contents.
const { OAuth2Client } = require('google-auth-library');
const config = require('../config');

let client;
const getClient = () => client || (client = new OAuth2Client(config.googleClientId));

/** Throws if the token is invalid. Returns { sub, email, name, picture } on success. */
async function verifyGoogleCredential(credential) {
  if (!config.googleClientId) throw new Error('GOOGLE_CLIENT_ID is not configured');
  const ticket = await getClient().verifyIdToken({ idToken: credential, audience: config.googleClientId });
  const p = ticket.getPayload();
  if (!p || !p.email || !p.email_verified) throw new Error('Google account email is not verified');
  const email = p.email.toLowerCase();
  if (!email.endsWith(`@${config.allowedEmailDomain}`)) throw new Error('Email is outside the allowed domain');
  if (p.hd && p.hd.toLowerCase() !== config.allowedEmailDomain) throw new Error('Workspace domain mismatch');
  return { sub: p.sub, email, name: p.name || email.split('@')[0], picture: p.picture || null };
}

module.exports = { verifyGoogleCredential };
