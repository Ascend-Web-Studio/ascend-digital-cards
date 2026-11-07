import {createClient} from '@supabase/supabase-js';

const message = document.querySelector('#message');
const form = document.querySelector('#email-form');
const emailInput = document.querySelector('#email');
const codeInput = document.querySelector('#code');
const google = document.querySelector('#google');
const send = document.querySelector('#send');
const verify = document.querySelector('#verify');
const signout = document.querySelector('#signout');
let client;
let busy = false;
let sentAt = 0;
let pendingEmail = '';
function tell(text) { message.textContent = text; }
function lock(value) {
  busy = value;
  for (const control of [google, send, verify, signout, emailInput, codeInput]) control.disabled = value;
}
async function action(fn) {
  if (busy || !client) return;
  lock(true);
  try { await fn(); } catch { tell('Could not complete sign-in. Please try again.'); }
  finally { lock(false); }
}
async function checkSession(session) {
  if (!session?.access_token) {
    tell('Sign in with Google first. You can then test email codes with the same address.');
    signout.hidden = true;
    return;
  }
  const response = await fetch('/auth/session', {
    headers: {Authorization: `Bearer ${session.access_token}`}, cache: 'no-store',
  });
  signout.hidden = false;
  if (response.ok) {
    const data = await response.json();
    tell(`Sign-in verified for ${data.email}. Your dashboards remain locked while we prepare the data migration.`);
  } else {
    tell(response.status === 403 ? 'This account is not enabled for staging. Sign out and use the designated owner account.' : 'Your session could not be verified. Sign out and try again.');
  }
}
google.addEventListener('click', () => action(async () => {
  const {error} = await client.auth.signInWithOAuth({provider:'google', options:{
    redirectTo: `${location.origin}/auth/callback`, queryParams:{prompt:'select_account'},
  }});
  if (error) tell('Google sign-in could not start. Please try again.');
}));
form.addEventListener('submit', event => { event.preventDefault(); send.click(); });
send.addEventListener('click', () => action(async () => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value.trim())) {
    tell('Enter a valid email address.'); return;
  }
  if (Date.now() - sentAt < 60000) { tell('Wait one minute before requesting another code.'); return; }
  const email = emailInput.value.trim().toLowerCase();
  const {error} = await client.auth.signInWithOtp({email, options:{shouldCreateUser:false}});
  if (error) { tell('Could not send a code. Check the email address, wait a minute, and try again.'); return; }
  pendingEmail = email;
  sentAt = Date.now();
  codeInput.value = '';
  tell('If this address has an account, a code will arrive shortly. Enter the 8-digit code within 10 minutes.');
}));
verify.addEventListener('click', () => action(async () => {
  if (!pendingEmail || emailInput.value.trim().toLowerCase() !== pendingEmail) {
    tell('Request a code for this email address first.'); return;
  }
  const token = codeInput.value.trim();
  if (!/^\d{8}$/.test(token)) { tell('Enter the 8-digit code from your email.'); return; }
  const {data,error} = await client.auth.verifyOtp({email:pendingEmail, token, type:'email'});
  codeInput.value = '';
  if (error) { tell('The code could not be verified. Check it or request a new code.'); return; }
  pendingEmail = '';
  await checkSession(data.session);
}));
signout.addEventListener('click', () => action(async () => {
  const {error} = await client.auth.signOut({scope:'local'});
  if (error) { tell('Sign-out could not finish. Please try again.'); return; }
  await checkSession(null);
}));
async function start() {
  lock(true);
  try {
    const response = await fetch('/auth/config', {cache:'no-store'});
    if (!response.ok) throw new Error('Unavailable');
    const config = await response.json();
    client = createClient(config.url, config.publishableKey, {auth:{
      flowType:'pkce', persistSession:true, autoRefreshToken:true,
      detectSessionInUrl:false, storage:window.sessionStorage, storageKey:'ascend-staging-auth',
    }});
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const denied = params.has('error');
    // Remove callback credentials from the address bar before any further work.
    if (location.pathname === '/auth/callback') history.replaceState({}, '', '/login');
    if (denied) { tell('Google sign-in was not completed. Please try again.'); return; }
    if (code) {
      const {data,error} = await client.auth.exchangeCodeForSession(code);
      if (error) { tell('The sign-in link expired or was opened in a different tab. Start Google sign-in again here.'); return; }
      await checkSession(data.session);
    } else {
      const {data,error} = await client.auth.getSession();
      if (error) throw error;
      await checkSession(data.session);
    }
    lock(false);
  } catch { tell('Sign-in is temporarily unavailable. Please refresh and try again.'); }
  finally { if (client) lock(false); }
}
start();
