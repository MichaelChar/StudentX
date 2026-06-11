// Server component shown when a signed-in user is NOT on the ADMIN_EMAILS
// allowlist. Distinct from the guest case (which redirects to login) so we never
// bounce an already-signed-in user into a login loop, and never flash admin
// chrome before the check.
export default function NotAuthorized({ email }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl font-bold text-night mb-2">Not authorised</h1>
        <p className="text-night/60">
          {email ? <strong>{email}</strong> : 'This account'} is signed in but is not on the admin allowlist.
        </p>
        <p className="text-night/40 text-sm mt-3">
          Add the address to the ADMIN_EMAILS Worker secret to grant access.
        </p>
      </div>
    </div>
  );
}
