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
function isValidEvent(d) {
  return d.keys().hasAll(['name','slug','primaryLocale','status','dates','publishToPublic','createdAt'])
      && d.name is string
      && d.slug is string
      && d.primaryLocale is string
      && d.status in ['planning','live','archived']
      && d.dates.start is timestamp
      && d.dates.end is timestamp
      && d.publishToPublic is bool;
}

match /organizations/{orgId} {
  allow read:   if inOrg(orgId);
  allow create: if false;
  allow update: if inOrg(orgId)
                && hasRole(['director'])
                && isValidOrganization(request.resource.data)
                && fieldUnchanged('slug');
  allow delete: if false;

  match /memberships/{userId} {
    allow read:   if inOrg(orgId);
    allow write:  if false;                                // server-only via Cloud Functions
  }

  match /events/{eventId} {
    allow read:   if inOrg(orgId);
    allow create: if inOrg(orgId)
                  && hasRole(['director','booker','production'])
                  && isValidEvent(request.resource.data);
    allow update: if inOrg(orgId)
                  && hasRole(['director','booker','production'])
                  && isValidEvent(request.resource.data)
                  && fieldUnchanged('slug');
    allow delete: if inOrg(orgId) && hasRole(['director']);
  }
}
