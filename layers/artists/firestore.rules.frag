function affectedFields() {
  return request.resource.data.diff(resource.data).affectedKeys();
}
function onlyFieldsChanged(allowed) {
  return affectedFields().hasOnly(allowed);
}
function isValidArtistOnCreate(d) {
  return d.name is string && d.name.size() > 0
      && d.category is string
      && d.status in ['planned','inquired','confirmed','declined','cancelled']
      && d.createdBy == request.auth.uid
      && d.deletedAt == null;
}
function isValidArtistOnUpdate(d) {
  return d.name is string && d.name.size() > 0
      && d.status in ['planned','inquired','confirmed','declined','cancelled']
      && d.updatedBy == request.auth.uid;
}

match /organizations/{orgId}/events/{eventId}/artists/{artistId} {
  allow read:   if inOrg(orgId)
                && hasRole(['director','booker','production','finance','pr','crew'])
                && resource.data.deletedAt == null;

  allow create: if inOrg(orgId)
                && hasRole(['director','booker'])
                && isValidArtistOnCreate(request.resource.data);

  allow update: if inOrg(orgId)
                && resource.data.deletedAt == null
                && (
                  (hasRole(['director','booker'])
                    && isValidArtistOnUpdate(request.resource.data))
                  || (hasRole(['production'])
                      && onlyFieldsChanged(['intendedDay','intendedLocationId',
                                            'performanceDurationMin','performanceNote',
                                            'checklist','comment','updatedAt','updatedBy']))
                  || (hasRole(['pr'])
                      && onlyFieldsChanged(['shortDescription','links',
                                            'updatedAt','updatedBy']))
                );

  allow delete: if inOrg(orgId) && hasRole(['director']);

  match /activity/{logId} {
    allow read:   if inOrg(orgId);
    allow create: if inOrg(orgId) && request.resource.data.uid == request.auth.uid;
    allow update, delete: if false;
  }
}
