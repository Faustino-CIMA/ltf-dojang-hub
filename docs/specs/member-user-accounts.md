# Member user accounts

Status: approved and implemented. No database migration.

A club admin or an LTF admin can create a login for a member without sending email, see who already has one, and hand over a first-login link. Today a member record and a login are separate. Linking an existing login is explicit (`members/ltf_staff.py` `_link_login`, and the club-admin assignment board). Merging two logins is a superuser action that requires a second factor (`accounts/merge.py`, ops merge). First-login links already exist for ops (`docs/specs/ops-bulk-login-links.md`): 7 days, single use, no email, CSV and PDF.

## What the operator sees

### Badge

A small badge with a user icon, in three places:

- `/dashboard/club/members`, as its own column
- `/dashboard/ltf/members`, as its own column
- the member detail page, in the overview card, on the same row as the "Overview" title, after that title

States:

| State | Meaning | Tone |
| --- | --- | --- |
| No account | `member.user` is empty | muted, neutral |
| Waiting for first login | a login exists, it is active, and the person has not finished account setup | warning token (amber), not an error |
| Active | a login exists, it is active, and setup has been completed | info or success token |
| Disabled | the linked login has `is_active` false | muted, neutral. Not red |

"Finished setup" means an `AccountSetupInvite` for that user has `used_at` set, or the user has a usable password and no unused open invite. A random password stored at creation does not count as finished: the person still has to open the first-login link and choose their own password.

The column is sortable and filterable (All, No account, Waiting, Active, Disabled). The filter is a pill row, same pattern as the other member filters. Theme tokens only.

### Create one account

In the row three-dots menu, and in the same menu on the detail page:

1. Edit stays first.
2. **Create user account** comes after Edit.
3. Delete, if present, stays last.

If the member already has a login, the item is **Copy first-login link** when the account is still waiting, and hidden when the account is already active. A disabled login is not recreated here. Enabling it stays the existing user action.

The action opens a side panel, not a dropdown. The panel names the member, shows the username that will be created, and says that no email will be sent. Confirm creates the account. Cancel does nothing.

### Create many accounts

Both member lists already tick visible rows only (PR #88): the header tick is the current page, other pages stay ticked, a new search or filter drops hidden ticks, and nothing is stored in the browser.

The bulk action lives in the Actions popover: **Create user accounts**. It is enabled when at least one ticked row has no login. The confirm panel shows:

- how many accounts will be created
- how many will be skipped, and why (already has an account, under 16, inactive, needs a decision)
- the sensitive-file warning from the login-link spec

Confirm creates the accounts once and downloads the CSV. PDF is a second button for the same tokens, not a second set. If every ticked person is skipped, no file is created.

## Who may do it

Server-side, on every create and every link:

- A full club-admin desk may create or link logins only for members of that club.
- A full LTF-admin desk may do it for every member, including people with no club.
- A superuser may do it when the request is on a full club-admin desk for that club, a full LTF-admin desk, or the ops desk.
- A view-only grant is refused, even if the person is also a superuser on that request's desk.
- A coach, a member, and LTF finance are refused. Finance records money. It does not mint identities.

The new login is always role `member`. It does not receive a club-admin, coach, finance, or LTF-admin desk. Separation of duties stays: this action cannot turn a member into staff, and a club admin cannot attach a member to an existing LTF-admin or finance login. That case is refused with a short explanation, and the text points at the ops merge tool.

A club admin cannot create a login for their own member row if that would change their existing staff role. If the member row is already linked to their login, the badge shows that account and the action is not offered.

## Username

Reuse `build_username` in `clubs/admin_assignment.py`: first letter of the given name plus the family name, lower case, letters and digits only, at most 10 characters. If that name is taken, append 1, 2, 3, and so on, still within 10 characters. Empty names fall back to `member`, then `member1`.

No email is required to create the account. If the member has none, the username is still generated. The existing account-setup page already asks for an email when the password is chosen. This feature does not add a second setup page and does not invent an address.

## Do not create a duplicate

Before creating, the server checks, in order:

1. This member already has `user` set. Skip. Do not create another login.
2. The member's email matches an existing login, ignoring blank emails. Do not create.
3. That login is already linked to a different member. Do not link. Tell the operator to use the ops account merge (superuser, second factor, nothing matched by name).
4. That login is not linked to a member, and its role is `member`. The side panel offers **Link this login** instead of create, and it shows that username. One confirm is enough. Linking sets `member.user` and does not change the login's role or password. No email is sent. A first-login link is offered only if that login has never finished setup.
5. That login's role is club admin, coach, LTF admin, or finance. A club-admin desk is refused. An LTF-admin desk or a superuser is also refused from this screen: staff logins are not member accounts. Merge remains the tool when two identities must become one.

Name-only matches are not links. Two people can share a name. The only automatic match is a non-blank email, or the member's own `user` field.

## Minors

Decided:

- Under 16 on the day of the action: no login. The row is skipped in a bulk run, with the reason "under 16". A guardian or family contact stays what it is today: the invoice recipient, not a user account. This feature does not create a login for a parent.
- If the guardian is also a member, their own row can get an account through the same action. The child's row stays without one.
- From 16 to 17: a normal member login is allowed. Still no staff desk and no authenticator requirement.
- No date of birth: refuse until a date is saved. There is no override.

This is stricter than the committee rule, which uses 18.

## After creation: the link, not an email

Nothing is emailed. Not the member, not the club, not the operator.

The accounts created by that one confirm are handed over with the existing first-login mechanism:

- `issue_setup_invite`, 7 days, single use
- a new link revokes older unused setup links for that user
- CSV download, and a PDF of the same tokens
- the file columns stay username, name, link type (`first_login`), link, expiry, skipped
- skipped reasons for this action: `has_account`, `under_16`, `no_birth_date`, `inactive`, `needs_link`, `staff_login`
- confirm text states the count and warns that the file is secret
- response header `Cache-Control: no-store`
- the raw token is not written to the audit log, application logs, or error reports

A single member also gets **Copy link** in the panel, for the token just created. Copying does not create a second token. If they already had a waiting account, **Copy first-login link** mints one new invite (the old unused invite is revoked) and copies that URL. That re-issue is audited. It still does not send email.

People skipped because a link decision is needed (`needs_link`) are not in the file as live URLs. The panel lists them so the operator can open each row and choose Link.

Inactive members are skipped. A disabled member record does not gain a way back in through a new login.

## What the member gets

Role `member`. Desk `member` only. No elevated desk, so no authenticator enrolment and no MFA grace change. Email codes stay available only under the current rule for people who are not staff. This action does not turn them on.

After the first login the person lands on `/[locale]/dashboard/member`: their own history, their photo, and the calendar when that module is entitled for the install. They do not see club admin, finance, or ops.

The password stored at creation is random and unused. The setup link replaces it when they choose their own. They never see the random value.

## Lists and performance

The member list queryset annotates the badge. It does not query invites once per row.

- `select_related("user")`
- a subquery for "has a used setup invite" and "has an open unused invite"
- `account_state` is one of `none`, `pending`, `active`, `disabled`, computed in that annotation
- list ordering allow-list gains `account`
- the filter is a query parameter, applied in the same queryset

The serializer returns `account_state` and, when a login exists, the username already available on `linked_user`. It does not return the invite token.

## Audit

One ops audit row per confirm, after the accounts exist and before the file is returned.

- action `members.bulk_user_accounts` or `members.user_account` for a single create or link
- message is counts only, for example "Created 12 member logins. Skipped 3."
- metadata: actor id, desk, created member ids, linked member ids, skipped member ids and reasons
- no URL, no raw token, no password

Linking an existing login is its own single-row audit, action `members.user_linked`, with the member id and the user id, still without a URL.

## Migrations

No schema change. The member already points at one user. Setup invites and `is_active` already exist. `build_username` already handles collisions. The list annotation filters invites by the user foreign key, which is already indexed, so no extra index was added.

## Tests

Backend, with fake people only:

- a club admin with a full grant creates a login for their own member and is refused for another club
- a view-only desk is refused
- LTF finance and a coach are refused
- an LTF admin can create one for a member with no club
- no email sender is called
- the username is unique when two members share a family name
- a member with no email still gets an account, and the setup page is what collects the address
- an email that already belongs to an unlinked member login does not create a second user
- an email that belongs to a login already tied to someone else is refused
- a club admin cannot link a member to an LTF-admin login
- under 16 is skipped and no user row is created
- the first-login link expires in 7 days, works once, and revokes the older unused invite
- the audit row has ids and counts, and no `http` or token
- the member list annotation returns the four states in one query (assert the query count stays flat as the page grows)

Frontend:

- the badge renders the four states with the theme classes, not a danger token
- the three-dots order stays Edit, then Create user account, with Delete last
- bulk selection still follows the visible-row rules
- the confirm shows the count and the sensitive-file warning
- the second download does not call create again

## Copy

| Key | en | fr | de | lb |
| --- | --- | --- | --- | --- |
| accountBadgeNone | No account | Pas de compte | Kein Konto | Keen Kont |
| accountBadgePending | Waiting for first login | En attente de la première connexion | Wartet auf die erste Anmeldung | Waart op déi éischt Umeldung |
| accountBadgeActive | Account | Compte | Konto | Kont |
| accountBadgeDisabled | Disabled | Désactivé | Deaktiviert | Desaktivéiert |
| accountColumn | Account | Compte | Konto | Kont |
| createUserAccount | Create user account | Créer un compte | Konto anlegen | Kont uleeën |
| createUserAccounts | Create user accounts | Créer des comptes | Konten anlegen | Konten uleeën |
| copyFirstLoginLink | Copy first-login link | Copier le lien de première connexion | Link für die erste Anmeldung kopieren | Link fir déi éischt Umeldung kopéieren |
| linkExistingLogin | Link this login | Lier cette connexion | Dieses Konto verknüpfen | Dëse Login verbannen |
| accountNoEmailSent | No email will be sent. | Aucun e-mail ne sera envoyé. | Es wird keine E-Mail gesendet. | Et gëtt keng E-Mail geschéckt. |
| accountUnder16Skip | {count} members under 16 will be skipped. | {count} membres de moins de 16 ans seront ignorés. | {count} Mitglieder unter 16 werden übersprungen. | {count} Member ënner 16 ginn iwwersprong. |

The sensitive-file warning and the download button labels stay the ones already specified for login-link files.

## Out of scope

- Emailing the member, the guardian, or the operator.
- Choosing the password for them.
- Creating a login for a parent who is not a member.
- Turning on two-factor enrolment for member accounts.
- Granting any desk other than `member`.
- Merging two accounts from this screen.
- Changing the ops user list.

## Decisions

1. No login under 16. Ages 16 and 17 are allowed as ordinary member logins.
2. A missing date of birth is refused until one is saved. There is no override.
3. The current 10-character username stays (`build_username`).
4. "Copy first-login link" may mint a fresh link while the account is still waiting. The older unused link is revoked, and the re-issue is audited. No email is sent.
5. One confirm is enough when the only match is the email, as long as the panel shows the login being linked.
6. Inactive members are always skipped.
