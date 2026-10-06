---
title: LTF Dojang Hub
subtitle: Manuel d'utilisation pour les clubs, les entraîneurs et la fédération
cover_roles: Administrateurs de club · Entraîneurs · LTF Admin · LTF Finance
ui: en
html_lang: fr
edition: octobre 2026
pdf_name: LTF-Dojang-Hub-Manuel-utilisateur-FR.pdf
labels:
  manual: Manuel d'utilisation
  app_version: Version de l'application
  edition: Édition
  lang_name: Français
  contents: Sommaire
  figure: Figure
  tip: Astuce
  warning: Attention
  note: Bon à savoir
  glossary: Glossaire
  glossary_intro: "Les termes de ce manuel, avec l'intitulé affiché à l'écran en anglais et en luxembourgeois. L'application elle-même existe dans ces deux langues."
  term: Terme
  en_screen: À l'écran (anglais)
  lb_screen: À l'écran (luxembourgeois)
  meaning: Signification
  index: Index
  page_abbr: p.
index_terms:
  - Absent = absents?
  - Adresse = adresses?
  - Passage de grade = passages? de grade
  - Relevé bancaire = relevés? bancaires?|CAMT\.053
  - Destinataire de la facture = destinataire|reçoit la facture
  - Calendrier = calendrier
  - Modèle de carte = modèles?
  - Administrateur de club = administrateurs? de club
  - Profil du club = Club profile|profil du club
  - Entraîneur = entraîneurs?
  - Rémunération des entraîneurs = rémunération
  - Comité = comité
  - Note de crédit = notes? de crédit
  - Fichier CSV = CSV
  - Supprimer un membre = supprim(er|ez|ant)
  - E-mail = e-mails?
  - Dépenses = dépenses?
  - Famille = familles?
  - Remise familiale = remises?
  - Grade = grades?
  - Vacances = vacances|jours fériés
  - Import = import(er)?
  - Membre inactif = inactifs?
  - Recettes = recettes?
  - Facture = factures?
  - Langue = langue
  - Licence = licences?
  - Carte de licence = cartes?
  - Frais de licence = frais de licence
  - Cotisation = cotisations?
  - MyGuichet
  - Fenêtre de commande = fenêtres? de commande
  - Parents = parents?|tuteur
  - Mot de passe = mots? de passe
  - Paiement = paiements?
  - Photo = photos?
  - Profil d'imprimante = profils? d'imprimante|décalage
  - Lot d'impression = lot|poste
  - Règle de promotion = promotion|heures requises
  - Consentement de publication = consentement
  - Qualité+ = Qualité\+
  - Étiquette QR = étiquettes?
  - Rappel = rappels?
  - Rapports = rapports?
  - Rôle = rôles?
  - Appel = appel
  - Boutique = boutique|vente au comptoir
  - Se connecter = connecter|connexion
  - Stock = stocks?|inventaire
  - Subsides = subsides?
  - Horaire = horaire
  - Transfert = transferts?
  - Trésorier = trésorier
  - Nom d'utilisateur = nom d'utilisateur
  - Visibilité = visibilité|qui voit
  - Confidentialité = confidentialité|GDPR|RGPD
  - Saison = saisons?
imprint: |
  <p><strong>LTF Dojang Hub – Manuel d'utilisation</strong><br>Édition d'octobre 2026, pour la version 0.12.0 de l'application.</p>
  <p>Publié pour les clubs de la Fédération luxembourgeoise de taekwondo (LTF). Disponible en anglais, allemand, français et luxembourgeois.</p>
  <p>Toutes les captures d'écran proviennent d'une installation de démonstration remplie de clubs, de personnes et de montants fictifs. Toute ressemblance avec des personnes réelles est fortuite.</p>
  <p>L'application existe en anglais et en luxembourgeois. Ce manuel reprend les <strong>intitulés anglais</strong> dans des <span class="ui">cases bleues</span>, exactement comme à l'écran. Le glossaire à la fin donne aussi l'intitulé luxembourgeois de chaque terme important.</p>
  <p>L'application évolue sans cesse. Si votre écran diffère de ce manuel, c'est l'écran qui fait foi – signalez-le à la LTF pour que la prochaine édition soit mise à jour.</p>
---

# Bienvenue {#welcome}

LTF Dojang Hub est le bureau en ligne commun de la Fédération luxembourgeoise de taekwondo et de ses clubs. Les clubs y tiennent leur liste de membres, commandent les licences, font l'appel aux entraînements, facturent les cotisations et gèrent leur boutique. La fédération contrôle les licences, imprime les cartes de licence et tient ses comptes. Tout le monde partage un même calendrier. C'est un outil de gestion pour les équipes des clubs et de la fédération ; les membres et les parents ne s'y connectent pas.

## À qui s'adresse ce manuel ? {#audience}

Le manuel est organisé selon **ce que vous faites**, pas selon les écrans. Lisez les deux premiers chapitres, puis passez au chapitre de votre rôle.

| Vous êtes… | À lire |
|---|---|
| entraîneur | [Premiers pas](#getting-started), puis [Entraîneurs](#coaches) et [Calendrier](#calendar) |
| administrateur de club (président, secrétaire, trésorier, bénévole) | chapitres 2 à 10 – commencez par [L'année du club en un coup d'œil](#club-year) |
| au secrétariat de la LTF | [LTF Admin](#ltf-admin) ou [LTF Finance](#ltf-finance) |
| administrateur technique | [Modules (administrateur technique)](#ops) |

Les membres et les parents n'ont pas besoin de ce manuel : ils n'ont pas d'identifiant, et leur club gère leurs données.

## Comment lire ce manuel {#conventions}

- Les mots dans une case bleue, comme [[Common.signOut]], sont les **intitulés exacts à l'écran** (en anglais, comme dans l'application).
- Les chemins comme [[Common.navGroupClubManagement]] › [[navFinance]] › [[navBilling]] indiquent où cliquer, du menu de gauche jusqu'à l'onglet en haut.
- Les étapes numérotées se font dans l'ordre. Une ligne avec une coche indique ce que vous devez voir ensuite.
- Les cercles rouges numérotés sur une capture d'écran sont expliqués dans la liste sous l'image.

> [!TIP]
> Les astuces vous font gagner du temps.

> [!WARNING]
> Les encadrés « Attention » vous évitent des erreurs difficiles à corriger.

> [!NOTE]
> Les encadrés « Bon à savoir » expliquent pourquoi l'application se comporte ainsi.

# Premiers pas {#getting-started}

Il vous suffit d'un navigateur web sur ordinateur, tablette ou téléphone. Rien à installer.

## Se connecter {#sign-in}

Ouvrez l'adresse que la LTF vous a communiquée. La page de connexion s'affiche.

![La page de connexion](fig:signin)

<div class="legend" markdown="1">
1. Choix de la langue – anglais ou luxembourgeois, avant de vous connecter.
2. [[Auth.username]] (nom d'utilisateur)
3. [[Auth.password]] (mot de passe)
4. [[Auth.submit]] – vous connecte.
</div>

Pour vous connecter :
{: .proc}

1. Saisissez votre nom d'utilisateur dans [[Auth.username]]. Il figure dans l'e-mail de bienvenue, par exemple `anne.reding`.
2. Saisissez votre mot de passe dans [[Auth.password]].
3. Cliquez sur [[Auth.submit]].

Vous arrivez sur la page d'accueil de votre rôle, par exemple l'aperçu du club ou l'aperçu de la fédération.
{: .result}

> [!NOTE]
> Il n'existe pas d'inscription publique. Les identifiants sont créés quand une personne devient administrateur de club ou entraîneur (voir [Administrateurs de club](#club-admins) et [Onglet Entraîneurs](#coaches-tab)), ou par la LTF.
>
> Les membres et les parents ne reçoivent pas d'identifiant.

## Votre premier mot de passe {#first-password}

Avec votre identifiant, vous recevez un e-mail de bienvenue contenant un **lien pour définir votre mot de passe**.

1. Cliquez sur le lien de l'e-mail. La page [[Reset.title]] s'ouvre, votre [[Reset.usernameLabel]] est déjà rempli.
2. Saisissez un nouveau mot de passe dans [[Reset.passwordLabel]] puis à nouveau dans [[Reset.confirmPasswordLabel]].
3. Cliquez sur [[Reset.submit]], puis sur [[Reset.continueToLogin]].

> [!TIP]
> Laissez votre navigateur ou votre gestionnaire de mots de passe enregistrer le nom d'utilisateur avec le nouveau mot de passe. C'est justement pour cela que la page le pré-remplit.

## Confirmer votre adresse e-mail {#verify-email}

Si la page de connexion indique que votre e-mail n'est pas encore confirmé, ouvrez l'e-mail de confirmation et cliquez sur son lien. Pas d'e-mail ? Cliquez sur [[Auth.verifyLink]] sous le bouton de connexion, saisissez votre adresse e-mail et cliquez sur [[Verify.submit]].

## Mot de passe oublié {#forgotten-password}

La page de connexion n'a pas de lien « mot de passe oublié ». Adressez-vous à votre administrateur de club ou à la LTF : l'administrateur technique peut vous envoyer un nouvel e-mail de mot de passe. Si l'e-mail de bienvenue d'un nouvel administrateur de club n'a pas pu partir, l'application affiche en outre un [[adminResetLink]] à l'écran.

## Confidentialité et vos données {#privacy}

L'application a une page où vous gérez vous-même votre consentement et vos droits sur vos données. Elle ne figure pas dans le menu : vous l'ouvrez par son adresse.
{: .lead}

1. Connectez-vous.
2. Dans la barre d'adresse du navigateur, remplacez tout ce qui suit l'adresse de l'application par `/en/settings/privacy` (ou `/lb/settings/privacy`) et appuyez sur Entrée. Exemple : `https://<adresse de l'application>/en/settings/privacy`.

![La page de confidentialité {small}](fig:privacy)

La page <span class="ui">Privacy &amp; GDPR</span> propose trois commandes :

- <span class="ui">I consent to data processing.</span> (je consens au traitement des données) – cochez ou décochez la case. Le changement est enregistré aussitôt.
- <span class="ui">Export my data</span> – affiche vos données sur la page, sous <span class="ui">Export preview</span> : vos données de connexion et, si votre identifiant est lié à une fiche de membre, le nom, le grade et le club de ce membre, ses licences, l'historique des licences et des grades et les informations sur la photo. Les données sont seulement affichées à l'écran, pas téléchargées dans un fichier.
- <span class="ui">Delete my data</span> – supprime votre identifiant.

> [!WARNING]
> <span class="ui">Delete my data</span> ne demande aucune confirmation. Votre identifiant est supprimé immédiatement et vous êtes déconnecté. S'il est lié à une fiche de membre, la photo de profil est retirée et les notes de l'historique des grades sont effacées ; la fiche de membre et ses licences restent au club.

> [!NOTE]
> Cette page est en cours de révision. Pour l'instant, son texte n'existe qu'en anglais, même si vous utilisez l'application en luxembourgeois.

## L'écran en un coup d'œil {#screen}

Chaque page a le même cadre : le menu à gauche, une barre en haut et la zone de travail au centre.

![L'aperçu du club et les principales zones de l'écran](fig:shell)

<div class="legend" markdown="1">
1. **Menu**, regroupé sous des titres comme [[Common.navGroupClub]], [[Common.navGroupClubManagement]] et [[Common.navGroupCalendar]]. Vous ne voyez que ce que votre rôle et les modules de votre club permettent.
2. **Sélecteur de club** – si vous gérez plusieurs clubs, choisissez ici le club. Toutes les pages affichent alors ce club.
3. Votre nom, votre nom d'utilisateur et votre **badge de rôle**, par exemple [[Common.roleClubAdmin]].
4. **Langue** – passez à tout moment de [[Common.languageEnglish]] à [[Common.languageLux]].
5. [[Common.signOut]] (se déconnecter)
6. [[Common.sidebarCollapse]] – rétrécit le menu pour laisser plus de place aux tableaux. La version de l'application est affichée à côté.
</div>

> [!TIP]
> Sur un téléphone, le menu se replie. Touchez le bouton de menu en haut à gauche pour l'ouvrir.

## Les rôles : qui peut faire quoi ? {#roles}

Votre rôle détermine le menu que vous voyez. Chaque identifiant a un seul rôle.

| Badge de rôle | Personne type | Travail principal |
|---|---|---|
| [[Common.roleCoach]] | entraîneur | voit la semaine d'entraînement, fait l'appel, voit le calendrier |
| [[Common.roleClubAdmin]] | président, secrétaire, trésorier, bénévole | gère le club : membres, licences, finances, entraînements, boutique |
| [[Common.roleLtfAdmin]] | secrétariat fédéral | clubs, licences, cartes, transferts, calendrier fédéral |
| [[Common.roleLtfFinance]] | trésorier fédéral | commandes, factures, paiements et comptes de la fédération |
| [[Common.roleSuperuser]] | administrateur technique | modules, utilisateurs, état du système |

> [!NOTE]
> **Les membres et les parents n'ont pas d'identifiant.** LTF Dojang Hub est actuellement un outil de gestion pour les équipes des clubs et de la fédération. Le club gère les données de ses membres et de leurs parents et répond à leurs questions. Un accès pour les membres pourrait venir plus tard.

Ce que chaque rôle voit dans le menu du club :

| Page | Entraîneur | Admin de club |
|---|---|---|
| [[navTraining]] | oui ¹ | oui |
| [[Events.calendarTitle]] | oui | oui |
| [[navOverview]], [[navMembers]], [[navLicenses]], [[navPrintJobs]], [[navTransfers]], [[navPromotion]] | – ² | oui |
| [[navFinance]], [[navFamilies]], [[navShop]] | – | oui |
| [[navClubAdmins]], [[navSettings]] | – | oui |
{: .matrix}

¹ Les entraîneurs voient la semaine, font l'appel et indiquent qui a donné le cours. L'horaire, les vacances, les tarifs et les règles de promotion sont modifiés par les administrateurs de club. ² Ces pages apparaissent dans le menu d'un entraîneur, mais ne sont pas encore prévues pour les entraîneurs. Un entraîneur qui est aussi administrateur de club les utilise en tant qu'administrateur.

> [!NOTE]
> L'enregistrement des paiements est encore plus strict : il faut un mandat actuel au comité. Voir [Qui peut enregistrer des paiements ?](#payment-permission).

## Les modules : pourquoi certains menus manquent {#modules}

Des parties de l'application sont activées par club par la LTF sous forme de modules :

- **Gestion du club** (Club management) ajoute [[navFinance]], [[navFamilies]], [[navTraining]], [[navPromotion]] et [[navShop]] sous [[Common.navGroupClubManagement]].
- **Calendrier des événements** (Event calendar) ajoute [[Events.calendarTitle]] sous [[Common.navGroupCalendar]].

Même sans module, vous disposez des pages [[Common.navGroupClub]] : membres, licences, impression et transferts. Demandez à la LTF s'il vous manque un module.

# Entraîneurs {#coaches}

<p class="roles"><span class="chip">Entraîneur</span></p>

Un administrateur de club vous nomme entraîneur dans [[navSettings]] › [[clubSettingsTrainersTab]]. Vous recevez alors un identifiant avec le badge [[Common.roleCoach]].

> [!NOTE]
> Le rôle d'entraîneur est encore en construction. Ce chapitre décrit ce qui fonctionne aujourd'hui pour les entraîneurs : la semaine d'entraînement, l'appel et le calendrier. D'autres fonctions pour les entraîneurs sont prévues.

## Votre semaine {#coach-week}

Ouvrez [[navTraining]]. L'onglet [[trainingThisWeek]] liste tous les cours de la semaine avec leur statut et leurs entraîneurs.

![La semaine d'entraînement d'un entraîneur](fig:coach-week)

## Faire l'appel {#roll}

Faites-le pendant ou juste après le cours. Cela prend moins d'une minute.
{: .lead}

![Faire l'appel pour un cours](fig:roll)

<div class="legend" markdown="1">
1. [[trainingSessionCoaches]] – ajoutez ou retirez les entraîneurs qui ont réellement donné le cours.
2. Filtres d'âge comme [[trainingAge_all]] – ils raccourcissent seulement la liste ; tout membre actif peut participer.
3. [[trainingOnTheRoll]] – les élèves marqués présents.
4. [[trainingMarkShown]] – coche d'un coup toutes les personnes de la liste affichée.
5. [[trainingSaveRoll]]
6. [[trainingAddStudents]] – cherchez toute autre personne venue au cours.
</div>

1. Dans [[navTraining]] › [[trainingThisWeek]], cliquez sur [[trainingOpenRoll]] à côté du cours.
2. Les élèves habituels sont déjà sur la liste. Cliquez sur un nom pour le retirer si l'élève était absent.
3. Sous [[trainingAddStudents]], cochez les autres personnes présentes. La recherche aide si la liste est longue.
4. Vérifiez [[trainingSessionCoaches]].
5. Cliquez sur [[trainingSaveRoll]].

Le cours apparaît désormais comme [[trainingStatus_held]] et ses heures comptent pour la prochaine ceinture de chaque élève (voir [Promotion](#promotion)) et pour la rémunération des entraîneurs.
{: .result}

> [!TIP]
> Faites l'appel sur votre téléphone au bord du tapis. La page est conçue pour les petits écrans.

## Le calendrier des entraîneurs {#coach-calendar}

Les entraîneurs voient les événements publics du club et aussi les événements [[calendarVisibility_internal]]. Le club peut ainsi partager les réunions d'entraîneurs avec ses seuls entraîneurs et administrateurs. Voir [Calendrier](#calendar).

# Administrateur de club : membres et licences {#club-members}

<p class="roles"><span class="chip">Admin de club</span></p>

## Aperçu du club {#club-overview}

[[navOverview]] est votre tableau de bord. Il compte les membres, les licences et les factures ouvertes. Sa [[actionQueueTitle]] (liste d'actions) indique ce qui vous attend, chaque fois avec un bouton qui ouvre la bonne page.

![L'aperçu du club](fig:club-overview)

<div class="legend" markdown="1">
1. [[refreshAction]] – recharge les chiffres.
2. [[actionQueueTitle]] – si elle indique « All clear », rien ne vous attend.
</div>

## La liste des membres {#members-list}

[[navMembers]] liste toutes les personnes de votre club.

![La liste des membres](fig:members-list)

<div class="legend" markdown="1">
1. Recherche par nom.
2. Filtre [[filterAllTitle]] / [[filterActiveTitle]] / [[filterInactiveTitle]] (tous, actifs, inactifs).
3. Le menu [[membersMenuLabel]] : créer ou importer des membres.
4. [[Common.batchActionsLabel]] pour les membres cochés.
5. Case pour sélectionner un membre.
6. Supprimer un membre.
</div>

Cliquez sur un nom pour ouvrir le membre. Le menu [[Common.batchActionsLabel]] agit sur tous les membres cochés à la fois :

![Actions pour les membres sélectionnés](fig:members-actions)

<div class="legend" markdown="1">
1. [[actionPrintCards]] – voir [Imprimer les cartes de licence](#print-cards).
2. [[actionOrderLicense]] – voir [Commander des licences](#order-licences).
3. [[actionChangeStatus]] – rendre des membres actifs ou inactifs.
</div>

> [!WARNING]
> Préférez rendre un membre **inactif** plutôt que de le supprimer. La suppression efface aussi ses licences ; un membre inactif garde son historique.

## Ajouter un membre {#add-member}

1. Dans [[navMembers]], ouvrez [[membersMenuLabel]] et cliquez sur [[createMember]].
2. Remplissez [[firstNameLabel]], [[lastNameLabel]], [[sexLabel]] et [[dobLabel]].
3. Choisissez le [[ltfLicensePrefixLabel]]. Le numéro de licence LTF lui-même est attribué automatiquement à l'enregistrement. Ne remplissez [[Import.wtLicenseLabel]] que si le sportif possède déjà une licence World Taekwondo.
4. Le grade de ceinture s'ajoute après l'enregistrement, dans l'onglet [[memberGradesTab]].
5. Cliquez sur [[createMember]].

![Créer un membre](fig:member-new)

## Importer des membres depuis un tableur {#import}

À utiliser une fois, quand votre club démarre avec l'application, ou pour ajouter tout un groupe.
{: .lead}

1. Enregistrez votre liste au format CSV (une ligne par personne, une colonne par champ).
2. Dans [[navMembers]], ouvrez [[membersMenuLabel]] et cliquez sur [[Import.importMembers]].
3. [[Import.sourceStepTitle]] : choisissez le [[Import.dateFormatLabel]] de votre fichier et cliquez sur [[Import.chooseFileButton]]. Cliquez sur [[Import.continueToMapping]].
4. [[Import.mappingStepTitle]] : pour chaque champ de l'application, choisissez la colonne correspondante de votre fichier. [[Import.autoMapButton]] fait l'essentiel du travail. Tous les champs marqués [[Import.requiredBadge]] doivent être associés.
5. [[Import.previewStepTitle]] : cliquez sur [[Import.previewButton]]. Chaque ligne est [[Import.statusReady]], [[Import.statusDuplicate]], [[Import.statusInvalid]] ou [[Import.statusSkipped]]. Corrigez votre fichier ou changez l'action d'une ligne.
6. [[Import.confirmStepTitle]] : cliquez sur [[Import.startImport]].
7. [[Import.resultStepTitle]] montre ce qui a été créé.

![Étape 1 de l'assistant d'import](fig:import)

> [!TIP]
> Si votre fichier contient une colonne de fin d'affiliation, utilisez [[Import.membershipYearRulesLabel]] pour importer les membres actuels comme actifs et ignorer ceux qui sont partis depuis des années.

## La fiche du membre {#member-record}

La page d'un membre comporte six onglets.

![La page d'un membre](fig:member-detail)

<div class="legend" markdown="1">
1. [[memberOverviewTab]] – nom, date de naissance, numéros de licence, ceinture.
2. [[memberClubRecordTab]] – ce dont seul le club a besoin (ci-dessous).
3. [[memberCurrentLicensesTab]] – la licence de l'année et l'aperçu de sa carte.
4. [[memberLicenseHistoryTab]] (historique des licences)
5. [[memberGradesTab]] (grades)
6. [[memberClubMovementsTab]] – transferts entre clubs.
7. Modifier les données de l'aperçu.
8. [[photoChangeButton]] – ouvre l'éditeur de photo (voir [La photo d'un membre](#member-photo)).
9. [[downloadStatementAction]] – un PDF des factures et paiements du membre.
</div>

### Le dossier du club {#club-record}

[[memberClubRecordTab]] contient les informations dont le club a besoin au quotidien. Tout est facultatif : remplissez ce que vous utilisez.

![Le dossier du club](fig:member-record)

<div class="legend" markdown="1">
1. [[ClubMgmt.paysLicenseFee]] – décochez pour un membre qui ne doit pas payer les frais de licence du club.
2. [[ClubMgmt.memberFeeLabel]] – la cotisation appliquée ; [[ClubMgmt.memberFeeDefault]] si vous n'y touchez pas.
3. [[ClubMgmt.deliveryLabel]] – [[ClubMgmt.deliveryEmail]], [[ClubMgmt.deliveryPost]] ou [[ClubMgmt.deliveryHand]] (en main propre).
4. [[ClubMgmt.contacts]] – parents, tuteurs, contacts d'urgence.
</div>

On y trouve aussi [[ClubMgmt.ssn]], [[ClubMgmt.joinedAt]], deux nationalités, [[ClubMgmt.medicalNotes]], [[ClubMgmt.emails]], [[ClubMgmt.phones]], [[ClubMgmt.addresses]], [[ClubMgmt.mediaConsent]] et les dates des [[ClubMgmt.checkups]]. Cliquez sur [[ClubMgmt.saveRecord]] pour terminer.

> [!TIP]
> Pour un enfant, ajoutez le parent sous [[ClubMgmt.contacts]] et cochez [[ClubMgmt.alsoForFamily|name=the family]] : le même parent sert alors aussi pour les frères et sœurs.

### La photo d'un membre {#member-photo}

La photo est imprimée sur la carte de licence : une bonne photo évite une réimpression.

1. Ouvrez le membre et cliquez sur [[photoChangeButton]].
2. Déposez une image dans le cadre, cliquez sur [[photoSelectFileButton]], ou cliquez sur [[photoCameraButton]] puis sur [[photoCameraCaptureButton]].
3. Réglez [[photoZoomLabel]] et faites glisser l'image pour que le visage remplisse le cadre 8:10. L'encadré [[photoPreviewTitle]] montre le résultat.
4. Si vous le souhaitez, cliquez sur [[photoRemoveBackgroundButton]] et choisissez une couleur sous [[photoBackgroundColorLabel]].
5. Cochez [[photoConsentLabel]].
6. Cliquez sur [[photoSaveButton]].

> [!TIP]
> Un mur uni, une bonne lumière et un regard droit vers l'objectif donnent le meilleur résultat. Les photos JPEG, PNG et HEIC jusqu'à 10 Mo sont acceptées.

## Commander des licences {#order-licences}

Chaque sportif a besoin d'une licence LTF annuelle. Vous commandez les licences de plusieurs membres à la fois ; la LTF facture ensuite votre club.
{: .lead}

1. Dans [[navMembers]], cochez les membres qui ont besoin d'une licence.
2. Ouvrez [[Common.batchActionsLabel]] et cliquez sur [[actionOrderLicense]].
3. Choisissez l'[[yearLabel]]. Selon la politique fédérale, vous pouvez commander pour cette année ou précommander pour l'année suivante.
4. Sous [[orderLicenseAvailableTypesTitle]], cliquez sur un type de licence marqué [[orderLicenseStatusAvailable]].
5. Vérifiez [[orderLicenseReviewTitle]]. Les membres qui ont déjà cette licence figurent sous [[orderLicenseAlreadyLicensedTitle]] ; cliquez au besoin sur [[orderLicenseResolveDuplicatesAction]] ou [[orderLicenseResolveBlockedAction]].
6. Cliquez sur [[orderLicenseButton|year=2026]].

La page affiche [[orderLicenseSuccessTitle]]. Les licences restent [[statusPending]] (en attente) jusqu'à ce que la LTF ait reçu votre paiement et les ait activées.
{: .result}

![Commander des licences pour deux membres](fig:order-licenses)

> [!NOTE]
> Un type de licence non disponible indique pourquoi, par exemple [[orderLicenseUnavailableReasonWindow]] ou [[orderLicenseUnavailableReasonNoPrice]]. Les fenêtres de commande et les prix sont fixés par la LTF.

La commande et sa facture apparaissent dans [[navFinance]] › [[navOrders]] et [[navInvoices]]. Réglez la facture fédérale comme expliqué dans [Payer la LTF](#pay-ltf).

## La liste des licences {#licences}

[[navLicenses]] affiche toutes les licences du club avec leur statut : [[filterActiveTitle]], [[filterPendingTitle]] ou [[filterExpiredTitle]] (active, en attente, expirée). Recherchez par membre, année ou statut. Cochez des licences et utilisez [[Common.batchActionsLabel]] › [[actionPrintCards]] pour imprimer leurs cartes.

![La liste des licences](fig:licences)

## Imprimer les cartes de licence {#print-cards}

1. Cochez les membres (dans [[navMembers]]) ou les licences (dans [[navLicenses]]) dont vous voulez les cartes.
2. Ouvrez [[Common.batchActionsLabel]] et cliquez sur [[actionPrintCards]]. La page [[quickPrintTitle]] s'ouvre.
3. Vérifiez le [[quickPrintTemplateLabel]] et le [[quickPrintPaperProfileLabel]]. Choisissez un [[quickPrintPrinterProfileLabel]] si votre imprimante a besoin d'un décalage.
4. Vous imprimez sur une planche déjà entamée ? Dans [[quickPrintSlotPickerTitle]], cliquez sur les emplacements libres.
5. Cliquez sur [[quickPrintCreateAction]].
6. Ouvrez [[quickPrintOpenHistoryAction]] et cliquez sur [[printJobDownloadPdfAction]] quand la tâche affiche [[printJobStatusSucceeded]]. Imprimez le PDF à 100 % (sans « ajuster à la page »).

![Impression rapide](fig:print-jobs)

> [!TIP]
> Si l'impression est décalée de quelques millimètres, demandez à la LTF un profil d'imprimante avec le bon décalage X/Y plutôt que de modifier la carte.

## Transferts entre clubs {#transfers}

Un membre qui change de club est **envoyé** par l'ancien club et **accepté** par le nouveau. La licence et l'historique le suivent.
{: .lead}

Pour envoyer un membre vers un autre club :
{: .proc}

1. Ouvrez [[navTransfers]].
2. Cliquez sur le membre dans la colonne de gauche, puis sur le club de destination à droite. Les champs de recherche vous aident à les trouver.
3. Saisissez un [[transferFeeAmountLabel]] si votre club en demande, ou laissez 0 pour un transfert gratuit, et ajoutez une note.
4. Cliquez sur [[transferSendRequest]].

![Choisir le membre et le nouveau club](fig:transfers)

Pour répondre à une demande d'un autre club :
{: .proc}

1. Ouvrez [[navTransfers]]. Les demandes reçues figurent sous [[transferInboxTitle]] › [[transferIncomingLabel]].
2. Cliquez sur la demande. Lisez les messages ; écrivez-en un avec [[transferSendMessage]] si vous avez une question.
3. Cliquez sur [[transferAcceptAction]] ou sur [[transferRejectAction]].

![Répondre à un transfert entrant](fig:transfers-in)

<div class="legend" markdown="1">
1. Écrire un message à l'autre club.
2. [[transferSendMessage]]
3. [[transferAcceptAction]] (accepter)
4. [[transferRejectAction]] (refuser)
</div>

> [!NOTE]
> Le club d'origine peut annuler sa demande tant que l'autre club n'a pas répondu. Seuls les clubs qui ont un administrateur peuvent recevoir des transferts.

# Administrateur de club : les finances {#club-money}

<p class="roles"><span class="chip">Admin de club</span><span class="chip">Module gestion du club</span></p>

Sous [[navFinance]] se trouvent les comptes du club. Les onglets en haut sont : [[navOrders]], [[navInvoices]], [[navPayments]], [[navBilling]], [[navMembershipFees]], [[navIncome]], [[navExpenses]], [[navBank]], [[navReports]] et [[navSubsidies]].

> [!NOTE]
> Les comptes du club contiennent deux sortes de factures : les **factures LTF** (licences que votre club achète à la fédération) et les **factures du club** (cotisations et ventes de la boutique facturées à vos membres). Le filtre [[financeLedgerLabel]] dans [[navInvoices]] passe de l'une à l'autre.

## Qui peut enregistrer des paiements ? {#payment-permission}

Les paiements et autres modifications des comptes du club exigent un **mandat actuel au comité** : [[paymentsRecordDenied]] Tenez le comité à jour dans [[navSettings]] › [[clubSettingsCommitteeTab]] (voir [Comité](#committee)).

## Familles et remises {#families}

Une famille regroupe les membres d'un même foyer : ils reçoivent une seule facture et des remises familiales.

1. Ouvrez [[navFamilies]]. Saisissez un [[familyName]] et cliquez sur [[createFamily]].
2. Ouvrez la famille et ajoutez les membres **dans l'ordre des remises** : le rang 1 paie plein tarif, le rang 2 obtient la remise du deuxième membre, et ainsi de suite.
3. Sous [[receivesTheBill]], choisissez qui reçoit la facture, ou cliquez sur [[addParentOrGuardian]] pour un parent qui n'est pas membre.
4. Choisissez la [[deliveryLabel]]. [[billToDeliveryAuto]] est un bon choix par défaut.

![Les familles](fig:families)

[[familyInvoicePreview]] vous permet de vérifier les montants avant de facturer.

## Les cotisations {#fees}

[[navMembershipFees]] est la liste de prix. Configurez-la une fois ; elle est reprise l'année suivante.

1. Sous [[membershipFee]], saisissez un [[feeName]] (par exemple « Adultes ») et un [[feeAmount]], puis cliquez sur [[saveFee]]. Créez une cotisation par type : enfants, adultes, famille…
2. Quand un prix change, ne créez **pas** de nouvelle cotisation : ouvrez la cotisation, saisissez le nouveau montant et la date [[priceFrom]], puis cliquez sur [[saveNewPrice]].
3. Sous [[licenseFeeTitle]], fixez le montant que vous facturez aux membres pour leur licence LTF, ou laissez 0.00.
4. Sous [[billingsTitle]], ne cliquez sur [[addBilling]] que si vous facturez la cotisation plusieurs fois par an (par exemple au printemps). Choisissez ensuite sous [[licenseFeeBilling]] la facture qui porte les frais de licence – voir [Quand les frais de licence sont facturés](#license-fee-season).
5. Sous [[rebateRules]], cliquez sur [[addRebate]] pour les rangs 2, 3… Choisissez [[rebateKindPercent]] ou [[rebateKindAmount]]. Cochez [[rebateAppliesToLater]] pour que chaque enfant suivant bénéficie de la même remise.

![Les cotisations](fig:fees)

> [!NOTE]
> Les frais de licence sont ajoutés une fois par membre et par saison, sur la facture choisie sous [[licenseFeeBilling]]. Les remises familiales ne les réduisent jamais.

## Facturer l'année {#billing}

Une fois les cotisations et les familles prêtes, facturer tout le club ne prend que quelques clics.
{: .lead}

![La facturation des cotisations](fig:billing)

<div class="legend" markdown="1">
1. L'onglet [[navBilling]].
2. [[billingYear]] et, si votre club facture plusieurs fois, la facturation.
3. [[printPackAction]] – un PDF de toutes les factures à envoyer par la poste ou à remettre en main propre.
4. [[reviewIssueAction]] (vérifier et émettre)
5. [[selectReady]]
6. Filtre de statut.
7. Un foyer marqué [[billingBlocked]] – ouvrez-le pour en voir la raison.
</div>

1. Ouvrez [[navFinance]] › [[navBilling]] et choisissez l'[[billingYear]].
2. Repérez les foyers marqués [[billingBlocked]]. La raison est indiquée dans la ligne, le plus souvent [[chooseBillRecipient]] (pour un enfant) ou une cotisation manquante. Corrigez-les dans [[navFamilies]] ou [[navMembershipFees]].
3. Cliquez sur [[selectReady]].
4. Cliquez sur [[reviewIssueAction]], vérifiez les totaux dans la confirmation et cliquez sur [[issueInvoicesAction]].
5. Les factures par e-mail partent immédiatement. Pour les autres, cliquez sur [[printPackAction]] et imprimez le PDF.

Les foyers affichent maintenant [[billingInvoiced]]. Ils passent à [[billingPaid]] quand vous enregistrez le paiement.
{: .result}

> [!NOTE]
> Un membre dont la cotisation est de 0.00 reçoit une facture de 0,00 marquée payée, comme preuve d'affiliation. Elle ne remplace pas une licence LTF.

## Quand les frais de licence sont facturés {#license-fee-season}

La saison de taekwondo va de septembre à septembre, comme l'année scolaire luxembourgeoise. Les frais de licence sont normalement facturés avec la **première facture de la saison**. Dans l'application, les facturations sont toutefois comptées par année civile ([[billingYear]]) : la première facture de la saison n'est donc pas toujours [[billingInstallmentNumber|sequence=1]].
{: .lead}

- **Une facture par an** (en général en automne) : elle ouvre la saison et porte les frais de licence. Il n'y a rien à régler.
- **Deux factures par an** : la facture de printemps couvre la seconde moitié de la saison en cours, celle d'automne ouvre la nouvelle saison. La facture d'automne est alors la **deuxième** facture de l'année civile ou de l'exercice, et c'est elle qui doit porter les frais de licence.

Exemple : un club facture en février et en octobre 2026.

| Facture | Dans l'application | Saison | Frais de licence ? |
|---|---|---|---|
| Février 2026 | [[billingInstallmentNumber|sequence=1]], libellé « Printemps » | seconde moitié de 2025/26 | non – déjà facturés en octobre 2025 |
| Octobre 2026 | [[billingInstallmentNumber|sequence=2]], libellé « Automne » | début de 2026/27 | oui |

Pour le configurer :
{: .proc}

1. Ouvrez [[navFinance]] › [[navMembershipFees]] et choisissez l'année ([[billingYear]]) sous [[billingsTitle]].
2. Cliquez sur [[addBilling]] et saisissez un [[billingLabel]] pour la nouvelle facture, par exemple « Automne ».
3. Sous [[licenseFeeBilling]], choisissez [[billingInstallmentNumber|sequence=2]].

> [!NOTE]
> L'application décrit cette règle à deux endroits. Sous [[navBilling]], elle indique que les frais de licence sont ajoutés « on each member's first bill » (sur la première facture du membre) ; sous [[navMembershipFees]], « on the billing chosen for that year » (sur la facturation choisie pour l'année). Il s'agit les deux fois de la même facture : celle choisie sous [[licenseFeeBilling]], c'est-à-dire la première facture de la saison. Un membre qui arrive après le début de cette facturation paie les frais de licence sur la facture suivante. Les factures déjà émises ne changent pas.

## Enregistrer un paiement {#record-payment}

1. Ouvrez [[navFinance]] › [[navInvoices]] et cliquez sur [[recordPaymentButton]] à côté de la facture.
2. Vérifiez la [[paymentDateLabel]]. Par défaut, c'est aujourd'hui.
3. La [[paymentReferenceLabel]] (communication) est pré-remplie avec le numéro de facture, pour correspondre au virement.
4. Choisissez le [[paymentMethodLabel]] et cliquez sur [[recordPaymentButton]].

![Enregistrer un paiement](fig:record-payment)

> [!TIP]
> Demandez aux parents d'indiquer le numéro de facture en communication du virement. Le rapprochement bancaire (ci-dessous) devient alors presque automatique.

## Payer la LTF {#pay-ltf}

Les factures LTF de vos commandes de licences se trouvent dans [[navInvoices]] avec le filtre [[financeLedgerLabel]] sur LTF. Réglez-les par virement avec le numéro de facture en communication. LTF Finance enregistre le paiement et active les licences.

> [!NOTE]
> Le bouton [[Common.payNow]] n'effectue pour l'instant que des **paiements de test**. Le paiement en ligne n'est pas encore utilisé pour de vrais paiements, et le futur prestataire de paiement n'est pas encore choisi. En attendant, payez par virement.

## Autres recettes et dépenses {#income-expenses}

- [[navIncome]] : cliquez sur [[recordIncomeAction]] pour les subsides, dons, sponsoring et autres recettes. Joignez un [[receiptLabel]] si vous en avez un.
- [[navExpenses]] : la page des dépenses propres du club. Son sous-titre indique [[LtfFinance.clubExpensesSubtitle]] Cliquez sur [[recordExpenseAction]]. Le formulaire confirme que la dépense est imputée aux comptes de votre club, pas à ceux de la fédération : [[LtfFinance.clubExpenseFormSubtitle]] Remplissez [[expenseDateLabel]], [[expenseCategoryLabel]], [[expenseDescriptionLabel]], [[expensePayeeLabel]] et [[expenseAmountLabel]]. Cochez [[expenseAlreadyPaidLabel]] si l'argent a déjà quitté le compte et choisissez le [[paymentMethodLabel]]. Vous pouvez joindre un justificatif sous [[receiptLabel]] (PDF ou image).

Une erreur de saisie ? Ouvrez l'écriture et utilisez [[voidIncomeAction]] ou [[voidExpenseAction]]. Les écritures annulées restent visibles pour les vérificateurs aux comptes.

## Rapprochement bancaire {#bank}

[[navBank]] compare votre relevé bancaire avec les comptes. Aucune connexion à la banque n'est utilisée : vous importez un fichier.

1. Téléchargez un relevé CSV ou CAMT.053 depuis votre banque en ligne.
2. Dans [[navBank]], choisissez le fichier sous [[bankFileLabel]], puis cliquez sur [[importStatementAction]].
3. Ouvrez le relevé. Associez chaque ligne à un paiement, une recette ou une dépense, ou marquez comme ignorées les opérations purement bancaires comme les frais.

![Le rapprochement bancaire](fig:bank)

## Rapports pour l'assemblée générale {#reports}

[[navReports]] prépare le compte de résultat, les mouvements de trésorerie et une comparaison budgétaire pour un [[reportYearLabel]]. Saisissez une fois par an la [[openingCashTitle]] et cliquez sur [[saveOpeningCashAction]]. [[exportExcelAction]] télécharge le tout sous forme de tableur pour les vérificateurs.

![Les rapports financiers](fig:reports)

## Subsides {#subsidies}

[[navSubsidies]] prépare le dossier annuel MyGuichet pour le ministère et remplit les formulaires de subsides extraordinaires. L'application n'envoie rien : c'est toujours vous qui déposez la demande.
{: .lead}

![La page des subsides](fig:subsidies)

1. Choisissez l'[[subsidiesYear]]. La date limite habituelle est le 30 septembre.
2. Parcourez la liste [[subsidiesChecklist]] jusqu'à ce que tous les points soient verts.
3. Téléversez le [[subsidiesRibFile]].
4. Sous [[subsidiesCoaches]], indiquez la [[subsidiesEqf]] de chaque entraîneur et téléversez son diplôme. Les entraîneurs sont nommés dans [[navSettings]] › [[clubSettingsTrainersTab]].
5. Téléchargez la [[subsidiesTrainingList]] et la [[subsidiesTrainersList]]. Le président ou un membre délégué du comité les certifie.
6. Sous [[subsidiesYouth]], saisissez le numéro d'identification national de chaque enfant et exportez la [[subsidiesExportYouth]].
7. Recopiez le tableau [[subsidiesEffectifs]] dans MyGuichet.
8. Après le dépôt, indiquez [[subsidiesSubmittedOn]], puis plus tard [[subsidiesPaidOn]] et [[subsidiesPaidAmount]]. La prochaine fois qu'un président, vice-président, trésorier ou secrétaire ouvre la page, le montant est ajouté aux recettes du club.

Les points sont calculés ainsi :

| Valeur | Règle appliquée par l'application |
|---|---|
| [[subsidiesVolunteerPoints]] | moins de 50 membres licenciés : 150 · de 50 à 200 : 300 · plus de 200 : 500 |
| [[subsidiesCoachPoints]] | par entraîneur, selon la qualification : EQF 1 et 2 = 20 · EQF 2 bis et 3 = 40 · EQF 4 = 60 · EQF 5 et 6 = 100 |
| [[subsidiesQualite]] | 150 € par sportif licencié de moins de 16 ans |

Pour un déplacement à un championnat ou une coupe internationale, utilisez [[subsidiesExtraordinary]] : choisissez le [[subsidiesKind]], ajoutez les sportifs et les officiels, saisissez les frais de voyage, de séjour et d'inscription, cliquez sur [[subsidiesCreateCase]] puis sur [[subsidiesDownloadForm]].

# Administrateur de club : entraînements et promotion {#club-training}

<p class="roles"><span class="chip">Admin de club</span><span class="chip">Entraîneur</span><span class="chip">Module gestion du club</span></p>

[[navTraining]] comporte six onglets : [[trainingThisWeek]], [[trainingMonth]], [[trainingYear]], [[trainingTimetable]], [[trainingHolidays]] et [[trainingCoachHours]].

## La semaine {#training-week}

![La semaine d'entraînement](fig:training-week)

<div class="legend" markdown="1">
1. Les onglets d'entraînement.
2. [[trainingAddSession]] – pour un cours pendant les vacances scolaires ou à une date supplémentaire.
3. [[trainingOpenRoll]] – voir [Faire l'appel](#roll).
4. [[trainingCancel]] – par exemple quand la salle est fermée. Réservé aux administrateurs de club.
</div>

## Créer l'horaire {#timetable}

À faire une fois en début de saison. Chaque cours se répète ensuite chaque semaine jusqu'à la date de fin.
{: .lead}

1. Ouvrez [[trainingTimetable]].
2. Sous [[trainingAddClass]], saisissez [[trainingClassName]], [[trainingAudience]], [[trainingWeekday]], [[trainingStarts]] et [[trainingEnds]], ainsi que la saison [[subsidiesFrom]] / [[subsidiesTo]].
3. Laissez cochés [[trainingSkipPublic]] et [[trainingSkipSchool]] si le club fait une pause à ces moments-là.
4. Cochez [[trainingCountsUnder16]] pour les cours qui figurent sur la liste d'entraînements Qualité+.
5. Choisissez les [[trainingUsualCoaches]] et les [[trainingRegulars]]. Les élèves habituels sont présélectionnés à chaque appel.
6. Cliquez sur [[trainingAddClass]].

![Ajouter un cours hebdomadaire](fig:timetable)

## Les vacances {#holidays}

[[trainingHolidays]] liste les [[trainingPublicHolidays]] luxembourgeois de l'année. Ajoutez vos [[trainingSchoolHolidays]] avec [[trainingAddHoliday]]. Les cours qui sautent les vacances sont automatiquement supprimés ces jours-là.

![Jours fériés et vacances scolaires](fig:holidays)

## Vues mois et année {#month-year}

[[trainingMonth]] affiche les cours sous forme de calendrier ; [[trainingYear]] montre une marque par cours sur toute la saison. Ouvrez un jour pour faire l'appel.

![La vue mensuelle](fig:month)

## La rémunération des entraîneurs {#coach-pay}

[[trainingCoachHours]] additionne ce qui revient à chaque entraîneur.

1. Réglez [[trainingPayFrequency]] et les jours de paie, puis cliquez sur [[trainingSavePaydays]].
2. Sous [[trainingPayRateTitle]], choisissez pour chaque entraîneur [[trainingBasisHourly]] ou [[trainingBasisUnit]], saisissez le [[trainingRateColumn]] et cliquez sur [[trainingSaveRate]].
3. Sous [[trainingOutingsTitle]], ajoutez une ligne pour un tournoi, du carburant ou un hôtel payé par le club.

![La rémunération des entraîneurs](fig:coach-pay)

> [!NOTE]
> Seuls les cours donnés (appel enregistré) sont payés. Chaque entraîneur inscrit sur un cours touche le cours entier.

## Règles de promotion et passages de grade {#promotion}

[[navPromotion]] fixe le nombre d'heures d'entraînement nécessaires avant le grade suivant. Les heures sont comptées depuis le dernier grade de l'élève.
{: .lead}

![Les règles de promotion](fig:promotion)

Pour créer une règle :
{: .proc}

1. Choisissez le [[trainingNextGrade]].
2. Saisissez les [[trainingRequiredHours]].
3. Sous [[trainingHoursCount]], choisissez [[trainingHoursAll]] ou un type de cours.
4. Cliquez sur [[trainingSaveRule]].

Pour organiser un passage de grade :
{: .proc}

1. Sous [[trainingBeltTests]], saisissez le nom et la [[trainingDate]], puis cliquez sur [[trainingAddBeltTest]].
2. Cliquez sur [[trainingOpenTest]]. Les candidats affichent leurs [[trainingHoursSoFar]] et s'ils sont [[trainingReady]] (prêts) ou [[trainingShort]] (heures insuffisantes).
3. Le jour J, cliquez sur [[trainingPass]] ou [[trainingFail]] pour chaque candidat.

Une réussite enregistre le nouveau grade dans l'onglet [[memberGradesTab]] du membre.
{: .result}

![Un passage de grade](fig:belt-test)

# Administrateur de club : la boutique du club {#shop}

<p class="roles"><span class="chip">Admin de club</span><span class="chip">Module gestion du club</span></p>

[[navShop]] vend doboks, ceintures et protections à l'accueil du club. Il comporte trois onglets : [[shopTabSell]], [[shopTabItems]] et [[shopTabSales]].

## Ajouter un article {#shop-item}

1. Ouvrez [[shopTabItems]] et cliquez sur [[shopAddItem]].
2. Touchez [[shopPhoto]] pour prendre une photo avec votre téléphone.
3. Saisissez [[shopItemName]], [[shopCategory]], [[shopPurchasePrice]] et [[shopSalePrice]].
4. Cochez [[shopTrackStock]] si l'application ne doit pas vendre plus que ce qu'il y a en rayon.
5. Cliquez sur [[saveItem]].
6. Sous [[shopSizes]], ajoutez chaque taille avec ses propres prix et la quantité [[shopOnShelfNow]]. [[shopWarnBelow]] signale un stock bas.

![Modifier un article avec ses tailles](fig:shop-item)

Quand une livraison arrive, ouvrez l'article et utilisez [[shopGoodsArrived]]. [[shopPrintStickersNext]] imprime ensuite des étiquettes QR sur des planches Avery Zweckform L7121-25.

## Vendre au comptoir {#shop-sell}

![La vente au comptoir](fig:shop-sell)

<div class="legend" markdown="1">
1. Onglets de la boutique.
2. [[shopScanCamera]] – scanner l'étiquette QR de l'article.
3. [[shopBasket]] (panier)
</div>

1. Ouvrez [[shopTabSell]]. Scannez l'étiquette ou touchez l'article et sa taille.
2. Sous [[shopSoldTo]], cherchez le membre ou choisissez [[shopWalkIn]].
3. Choisissez [[shopPayCash]], [[shopPayCard]], [[shopPayOther]] ou [[shopPayLater]].
4. Cliquez sur [[shopCompleteSale]].

Les ventes non payées attendent dans [[shopTabSales]] jusqu'à ce que vous cliquiez sur [[shopMarkPaidCash]] ou [[shopMarkPaidCard]].

## L'inventaire {#shop-count}

Avant un inventaire, cliquez sur [[shopPrintCountSheet]] (onglet [[shopTabItems]]), puis sur [[shopTakeCountSheet]]. Cochez la feuille imprimée devant l'armoire. [[shopPrintCatalogue]] imprime une liste de prix pour le tableau d'affichage.

# Calendrier {#calendar}

<p class="roles"><span class="chip">Tous les rôles</span><span class="chip">Module calendrier</span></p>

Le calendrier est partagé par la LTF et tous les clubs. Chaque événement décide qui peut le voir.
{: .lead}

![Le calendrier](fig:calendar)

<div class="legend" markdown="1">
1. [[Events.calendarNew]] (nouvel événement)
2. [[Events.calendarPrevMonth]]
3. [[Events.calendarNextMonth]]
4. Dans le menu, le nombre indique les événements à venir ; [[Events.calendarNavNew]] signale des événements que vous n'avez pas encore ouverts.
</div>

## Créer un événement {#new-event}

1. Cliquez sur [[Events.calendarNew]].
2. Saisissez [[Events.calendarFieldTitle]], [[Events.calendarFieldStart]] et [[Events.calendarFieldEnd]] (ou cochez [[Events.calendarAllDay]]), [[Events.calendarFieldVenue]] et [[Events.calendarFieldAddress]].
3. Choisissez le [[Events.calendarFieldKind]] : [[Events.calendarKind_calendar]], [[Events.calendarKind_kyorugi]] ou [[Events.calendarKind_poomsae]].
4. Sous [[Events.calendarFieldVisibility]], choisissez qui le voit (tableau ci-dessous).
5. Cliquez sur [[Events.calendarSave]].

![Un nouvel événement de club](fig:event-form)

<div class="legend" markdown="1">
1. [[Events.calendarFieldVisibility]] – la description sous chaque choix indique exactement qui verra l'événement.
</div>

| Choix | Événement de club : qui le voit | Événement LTF : qui le voit |
|---|---|---|
| [[Events.calendarVisibility_public]] | membres, administrateurs et entraîneurs de ce club, plus LTF Admin | toutes les personnes connectées |
| [[Events.calendarVisibility_internal]] | administrateurs et entraîneurs de ce club | LTF Admin, LTF Finance, administrateurs de club et entraîneurs |
| [[Events.calendarVisibility_private]] | administrateurs de ce club uniquement | LTF Admins uniquement |
| [[Events.calendarVisibility_shared]] | la LTF et les administrateurs et entraîneurs de tous les clubs, plus les membres de ce club | la LTF et les administrateurs et entraîneurs de tous les clubs |
| [[Events.calendarVisibility_presidents]] | – | LTF Admins et le président en exercice de chaque club coché sous [[Events.calendarAudienceClubs]] |

> [!NOTE]
> Les descriptions à l'écran mentionnent aussi les membres. Aujourd'hui, les membres n'ont pas d'identifiant (voir [Rôles](#roles)) : en pratique, un événement est vu par les équipes indiquées.

> [!TIP]
> Vous organisez un tournoi de club ? Choisissez [[Events.calendarVisibility_shared]] : les autres clubs verront la date tôt et éviteront les doublons.

## Rappels {#reminders}

Ouvrez un événement, choisissez une date dans [[Events.calendarReminderOn]] et cliquez sur [[Events.calendarReminderSave]]. Ce jour-là, un rappel apparaît quand vous êtes dans l'application. Cliquez sur [[Events.calendarReminderSnooze]] ou [[Events.calendarReminderGotIt]]. [[Events.calendarReminderClear]] le supprime.

# Administrateur de club : profil, comité et administrateurs {#club-settings}

<p class="roles"><span class="chip">Admin de club</span></p>

[[navSettings]] comporte quatre onglets.

![Le profil du club](fig:club-profile)

<div class="legend" markdown="1">
1. [[clubSettingsProfileTab]] – adresse, e-mail, site web, IBAN, langue.
2. [[clubSettingsTrainersTab]] (entraîneurs)
3. [[clubSettingsCommitteeTab]] (comité)
4. [[clubSettingsPublicationTab]] (consentement de publication)
</div>

## Profil {#profile-tab}

Tenez à jour [[clubEmailLabel]], [[clubWebsiteLabel]], [[ibanLabel]] et [[clubLanguageLabel]] : ils figurent sur les factures envoyées à vos membres, et la LTF vous écrit dans cette langue. Cliquez sur [[saveClub]].

## Entraîneurs {#coaches-tab}

1. Ouvrez [[clubSettingsTrainersTab]].
2. Cliquez sur un membre à gauche, puis sur la case [[trainersDropColumn]] à droite.
3. Si le membre n'a pas encore d'adresse e-mail, saisissez-en une dans [[trainerEmailPlaceholder]] et cliquez sur [[trainerAdd]]. L'entraîneur reçoit un e-mail de bienvenue pour définir son mot de passe.
4. Cochez [[trainerQualite]] pour les entraîneurs qui figurent dans le dossier Qualité+.

![Les entraîneurs](fig:club-coaches)

> [!NOTE]
> Les entraîneurs doivent être des membres actifs et majeurs de votre propre club. [[trainerRemove]] retire le rôle d'entraîneur ; la personne reste membre.

## Comité {#committee}

Le comité détermine qui peut enregistrer des paiements, et son président reçoit les réunions destinées aux présidents de club.

1. Ouvrez [[clubSettingsCommitteeTab]]. Si nécessaire, cliquez sur [[createCommittee]].
2. Sous [[committeeOffices]], choisissez une fonction, par exemple President, saisissez [[committeeStart]] et cliquez sur [[addMandate]].
3. Cliquez sur la fonction, puis sur le membre qui l'occupe.

![Le comité du club](fig:committee)

> [!WARNING]
> Quand le trésorier change, mettez le comité à jour **avant** la prochaine série de paiements. Sans mandat actuel, personne au club ne peut enregistrer de paiement.

## Consentement de publication {#consent}

[[clubSettingsPublicationTab]] affiche une grille des membres et des canaux (site web, presse écrite, Facebook, Instagram…). Chaque coche est enregistrée immédiatement. Avant de publier des photos, cochez les canaux et téléchargez [[publicationPdfList]] pour obtenir la liste des membres à ne pas montrer.

## Administrateurs de club {#club-admins}

[[navClubAdmins]] détermine qui gère le club dans l'application.

1. Ouvrez [[navClubAdmins]]. Cliquez sur votre club à droite pour lister ses membres.
2. Cliquez sur un membre, puis à nouveau sur le club.
3. Si le membre n'a pas encore d'identifiant, saisissez une adresse e-mail sous [[adminEmailTitle]]. Un e-mail de bienvenue avec un lien pour définir le mot de passe est envoyé.

![Les administrateurs de club](fig:club-admins)

Sous [[adminsCurrentTitle]], vous pouvez retirer une personne qui ne doit plus administrer le club. [[adminsLicensedOnly]] limite la liste aux membres titulaires d'une licence valable.

# L'année du club en un coup d'œil {#club-year}

Une liste de contrôle pour les bénévoles pressés. Chaque ligne renvoie à la section qui l'explique.
{: .lead}

| Quand | Tâche | Section |
|---|---|---|
| Été | Mettre à jour comité, entraîneurs, profil du club | [Comité](#committee) |
| Avant la saison | Horaire, vacances, règles de promotion | [Horaire](#timetable) |
| Septembre | Cotisations et remises familiales | [Cotisations](#fees) |
| Septembre | Commander les licences de tous les sportifs | [Commander des licences](#order-licences) |
| Septembre | Payer la facture LTF | [Payer la LTF](#pay-ltf) |
| Après paiement | Imprimer les cartes de licence | [Imprimer les cartes](#print-cards) |
| Avant le 30 septembre | Dossier de subsides | [Subsides](#subsidies) |
| Octobre | Facturer les cotisations | [Facturation](#billing) |
| À chaque cours | Faire l'appel | [Faire l'appel](#roll) |
| Chaque mois | Enregistrer les paiements, importer le relevé | [Rapprochement bancaire](#bank) |
| Avant un examen | Passage de grade | [Promotion](#promotion) |
| Fin d'année | Rapports pour l'assemblée générale | [Rapports](#reports) |

# LTF Admin {#ltf-admin}

<p class="roles"><span class="chip">LTF Admin</span></p>

Le menu de la fédération ([[Common.navGroupFederation]]) contient [[LtfAdmin.navOverview]], [[LtfAdmin.navClubs]], [[LtfAdmin.navClubAdmins]], [[LtfAdmin.navMemberTransfers]], [[LtfAdmin.navMembers]], [[LtfAdmin.navLicenses]], [[LtfAdmin.navLicenseCards]], [[LtfAdmin.navLicenseCardPrintJobs]], [[LtfAdmin.navLicenseTypes]], [[LtfAdmin.navPrinterProfiles]] et [[LtfAdmin.navSettings]], ainsi que [[LtfAdmin.navCommittee]] et [[LtfAdmin.navCalendar]].

## Aperçu de la fédération {#ltf-overview}

L'aperçu compte les clubs, les membres et les licences. Sa liste d'actions signale les clubs sans administrateur, les transferts en attente avec indemnité et les membres qui attendent une licence.

![L'aperçu LTF](fig:ltf-overview)

## Clubs et administrateurs de club {#ltf-clubs}

[[LtfAdmin.navClubs]] liste tous les clubs. Ouvrez un club pour modifier ses coordonnées, téléverser ses logos (pour les factures, l'impression et l'écran) et voir ses membres.

![Un club vu par la LTF](fig:ltf-club)

[[LtfAdmin.navClubAdmins]] fonctionne comme la page du club décrite dans [Administrateurs de club](#club-admins), mais pour tous les clubs.

## Membres, licences et transferts {#ltf-licences}

- [[LtfAdmin.navMembers]] et [[LtfAdmin.navLicenses]] affichent tous les clubs à la fois ; le sélecteur de club permet de filtrer.
- [[LtfAdmin.navMemberTransfers]] liste les derniers changements de club, les transferts avec indemnité et les éventuels « touristes de club » – des membres qui ont changé de club anormalement souvent.

![Les transferts vus par la fédération](fig:ltf-transfers)

## Cartes de licence {#ltf-cards}

[[LtfAdmin.navLicenseCards]] contient les modèles de carte. Ouvrez un modèle dans l'éditeur pour placer la photo, le nom, le grade, le numéro de licence et le code QR. Publiez une version et définissez-la par défaut : les administrateurs de club imprimeront avec elle. [[LtfAdmin.navLicenseCardPrintJobs]] montre toutes les tâches d'impression de tous les clubs ; [[LtfAdmin.navPrinterProfiles]] enregistre le décalage X/Y des imprimantes connues.

![L'éditeur de cartes](fig:designer)

## Paramètres de la fédération {#ltf-settings}

[[LtfAdmin.navSettings]] contient l'adresse et l'IBAN de la fédération, le [[clubTouristThresholdLabel]] et l'option d'import [[importPrefixRewriteLabel]].

![Les paramètres de la fédération](fig:ltf-settings)

# LTF Finance {#ltf-finance}

<p class="roles"><span class="chip">LTF Finance</span></p>

Le menu des finances contient [[LtfFinance.navOverview]], [[LtfFinance.navOrders]], [[LtfFinance.navInvoices]], [[LtfFinance.navPayments]], [[LtfFinance.navIncome]], [[LtfFinance.navExpenses]], [[LtfFinance.navBank]], [[LtfFinance.navReports]], [[LtfFinance.navAuditLog]] et [[LtfFinance.navLicenseSettings]].

![L'aperçu des finances](fig:fin-overview)

## Prix des licences et fenêtres de commande {#license-settings}

Dans [[LtfFinance.navLicenseSettings]], l'onglet [[settingsTabLicenseTypes]] définit chaque type avec sa [[currentYearWindowLabel]] et sa [[nextYearWindowLabel]]. [[settingsTabLicensePrices]] conserve les prix avec leur historique : un nouveau prix s'applique à partir de sa date [[priceEffectiveFromLabel]].

![Les paramètres de licence](fig:fin-settings)

## Frais des clubs {#club-fees}

[[settingsTabClubFees]] liste ce que la LTF facture aux clubs (affiliation, assurance…) : [[clubFeeCadenceAnnual]], [[clubFeeCadencePerMember]], [[clubFeeCadencePerEvent]] ou [[clubFeeCadenceOneOff]]. Dans l'onglet [[settingsTabBilling]], choisissez l'[[clubFeeBillingYearLabel]], les frais et les clubs, puis cliquez sur [[clubFeeBillingSubmitYear|year=2026]]. Un club déjà facturé pour cette année est ignoré : vous pouvez relancer l'opération sans risque. [[clubFeeBillingRecurringLabel]] répète la facturation chaque mois ou chaque année.

![Facturer les frais des clubs](fig:fin-billing)

## Factures, paiements et notes de crédit {#ltf-invoices}

1. Ouvrez [[LtfFinance.navInvoices]] et cliquez sur une facture.
2. Quand le virement du club est arrivé, cliquez sur [[recordPaymentButton]]. Les licences payées deviennent actives.
3. Pour réduire ce qu'un club doit, saisissez un [[creditNoteAmountLabel]] et un [[creditNoteReasonLabel]], puis cliquez sur [[addCreditNoteAction]].
4. Pour relancer une facture impayée, cliquez sur [[sendReminderAction]]. [[lastRemindedAtLabel]] indique la date de votre dernière relance.

![Détail d'une facture avec notes de crédit](fig:fin-invoice)

## Les comptes de la fédération {#ltf-books}

[[LtfFinance.navIncome]], [[LtfFinance.navExpenses]], [[LtfFinance.navBank]] et [[LtfFinance.navReports]] fonctionnent comme les pages du club décrites dans [Administrateur de club : les finances](#club-money), pour les comptes propres de la fédération. [[LtfFinance.navAuditLog]] enregistre qui a modifié quoi.

![Les rapports de la fédération](fig:fin-reports)

# Modules (administrateur technique) {#ops}

<p class="roles"><span class="chip">Superuser</span></p>

L'administrateur technique ouvre la [[Common.openOpsConsole]]. Sous Modules, il saisit et valide un code produit signé fourni par la LTF, puis attribue à chaque club les modules qu'il peut utiliser. Le catalogue liste aussi des modules pas encore livrés, comme l'inventaire fédéral et les tournois ; ils ne peuvent pas être activés.

![Ops – modules](fig:ops-modules)

# Questions et dépannage {#faq}

### Je n'arrive pas à me connecter.
Vérifiez le nom d'utilisateur (ce n'est pas toujours votre adresse e-mail) et le mot de passe. Si la page indique que votre e-mail n'est pas confirmé, voir [Confirmer votre adresse e-mail](#verify-email). Mot de passe oublié ? Voir [Mot de passe oublié](#forgotten-password).

### Les membres ou les parents peuvent-ils se connecter ?
Non. L'application est actuellement un outil de gestion réservé aux équipes des clubs et de la fédération. Les membres et les parents n'ont pas d'identifiant ; leur club tient leurs données à jour. Un accès pour les membres pourrait venir plus tard.

### Un menu décrit ici est absent.
Votre rôle ou les modules de votre club ne le comprennent pas. Voir [Rôles](#roles) et [Modules](#modules).

### Je vois le mauvais club.
Choisissez votre club dans le sélecteur en haut de la page.

### « Only the president, vice president, treasurer… » s'affiche quand j'enregistre un paiement.
Vous n'avez pas de mandat actuel au comité. Demandez au président de mettre le [Comité](#committee) à jour.

### Un foyer est « Blocked » dans la facturation.
Lisez la raison dans la ligne. Le plus souvent, un enfant a besoin d'un destinataire de facture (voir [Familles](#families)) ou aucune cotisation n'est définie (voir [Cotisations](#fees)).

### Je ne peux pas choisir de type de licence lors de la commande.
La raison est indiquée à côté du type : la fenêtre de commande est fermée, il n'y a pas de prix, ou les membres ont déjà cette licence. Les fenêtres et les prix sont fixés par LTF Finance.

### La carte imprimée est décalée.
Imprimez à 100 % et utilisez un profil d'imprimante avec le bon décalage (voir [Imprimer les cartes de licence](#print-cards)).

### Les dates s'affichent au format mm/dd/yyyy.
Les champs de date suivent la langue de votre navigateur. Réglez-le sur français, allemand, luxembourgeois ou anglais (Royaume-Uni) pour voir jour/mois/année.

### L'appel ne montre personne.
Pour un nouveau cours, ajoutez des élèves sous [[trainingAddStudents]] et enregistrez. Pour la fois suivante, inscrivez-les comme [[trainingRegulars]] dans l'[[trainingTimetable]].

### Le menu du calendrier affiche un nombre.
C'est le nombre d'événements à venir que vous pouvez voir. Le mot [[Events.calendarNavNew]] apparaît quand certains sont nouveaux pour vous.

### Comment exercer mes droits en matière de protection des données ?
Si vous avez un identifiant, utilisez la page décrite dans [Confidentialité et vos données](#privacy). Les membres et les parents s'adressent à leur club ou à la LTF, qui peuvent exporter ou corriger leurs données.

### Peut-on payer en ligne ?
Pas encore. Le bouton [[Common.payNow]] n'effectue que des paiements de test. Réglez les factures LTF par virement (voir [Payer la LTF](#pay-ltf)).
