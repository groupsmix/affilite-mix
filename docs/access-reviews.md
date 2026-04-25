# Production Access Reviews

**Review Frequency:** Quarterly

A formal review of access control rights must be conducted and documented every quarter for the following systems:

1. **GitHub Admins:** Ensure only current Tech Leads and authorized DevOps engineers have admin rights. Remove stale or offboarded users.
2. **Cloudflare Users:** Review members granted `Administrator` or `Super Administrator` roles in the Cloudflare Dashboard.
3. **Supabase Users:** Validate organization members who have production DB access or access to the `Service Role Key`.
4. **Sentry Users:** Verify members who can change alert rules or view sensitive transaction payloads.
5. **Stripe Users:** Ensure only Finance and necessary engineering leads have view/edit access to live mode API keys or customer data.
6. **Admin Dashboard `super_admins`:** Query the `admin_users` table to audit users flagged with `is_super_admin = true`. Revoke immediately if not strictly required.
