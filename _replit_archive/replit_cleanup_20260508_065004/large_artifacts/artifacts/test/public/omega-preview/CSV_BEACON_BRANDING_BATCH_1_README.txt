C.S.V. BEACON Branding Batch 1

What changed:
1. Added: public/csv-beacon-theme.css
2. Added: public/assets/csv-beacon-logo.png
3. Updated all public/*.html references:
   from ./tekmerion-theme.css?v=20260212_1
   to   ./csv-beacon-theme.css?v=20260428_1
4. Updated public/theme.js localStorage key:
   from tekmerion.theme
   to   csv-beacon.theme
   with backward-compatible migration of the previous saved preference.
5. Updated visible top-level branding in:
   - public/q-dashboard.html
   - public/index.html
   - public/login.html

Manual cleanup after copying:
- Delete public/tekmerion-theme.css from the Replit project after confirming all pages load correctly.
- Clear browser cache / hard refresh because service worker/browser cache may keep old CSS temporarily.

No database changes.
No Supabase changes.
No business logic changes.
