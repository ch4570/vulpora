# Member invitation design brief

The product is a workspace member directory. An owner invites one member at a time by email,
choosing Viewer or Editor. Viewers can read the directory but cannot invite members. The current
backend supports a single pending invitation and reports invalid email, already invited, permission
denied, and temporary service failure. Bulk invitations and role administration are outside scope.

Design the directory-to-invitation flow for narrow and wide screens. Reuse the typography, button,
form, spacing, and color variables in `tokens.css` and the existing `directory.html` structure.
Keep entered data when an invitation fails. Explain how an owner can recover without accidentally
sending a duplicate invitation. A successful request creates an invitation, not an active member.

No screenshots, browser session, analytics, interviews, or usability study are provided. Proposed
copy and success measures are design hypotheses. Return a design specification for implementation;
do not edit code or launch applications.
