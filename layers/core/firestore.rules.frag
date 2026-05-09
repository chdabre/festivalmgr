// Core layer Firestore rules.
// Per-collection rules grow as Plan B's tasks land.

function isValidOrganization(d) {
  return d.keys().hasAll(['name','slug','defaultLocale','defaultCurrency','enabledModules','createdAt'])
      && d.name is string
      && d.slug is string
      && d.defaultLocale is string
      && d.defaultCurrency is string
      && d.enabledModules is list;
}
function fieldUnchanged(field) {
  return request.resource.data[field] == resource.data[field];
}

match /organizations/{orgId} {
  allow read:   if inOrg(orgId);
  allow create: if false;                                 // server-only via seed-director
  allow update: if inOrg(orgId)
                && hasRole(['director'])
                && isValidOrganization(request.resource.data)
                && fieldUnchanged('slug');
  allow delete: if false;                                 // server-only
}
