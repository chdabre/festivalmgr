// Core layer Storage rules. Deny all by default; module fragments
// (Riders, Artists, Org branding) introduce paths as they land.
match /{allPaths=**} {
  allow read, write: if false;
}
