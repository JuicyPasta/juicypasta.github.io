/* Where "Hours wrong?" and "Want Latecup in your city?" reports go when the feed's manifest
   has no `report` block yet. Same shape as the manifest's block (Latecup SPEC.md); the
   manifest wins when it has one. A Google Form: no sign-in, no email collected. */
window.LATECUP_REPORT = {
  kind: 'google_form',
  url: 'https://docs.google.com/forms/d/e/1FAIpQLSdgZNntJS_IOoaZbLMaoXzfyUVRmVeqoWSO7uYz6QNXohZnHQ/formResponse',
  fields: { type: 'entry.416204548', place_id: 'entry.1281919753', place_name: 'entry.2034522100', note: 'entry.1615506675', app: 'entry.68838780' }
};
