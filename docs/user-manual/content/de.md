---
title: LTF Dojang Hub
subtitle: Benutzerhandbuch für Vereine, Trainer und den Verband
cover_roles: Club-Admins · Trainer · LTF Admin · LTF Finance
ui: en
html_lang: de
edition: Oktober 2026
pdf_name: LTF-Dojang-Hub-Benutzerhandbuch-DE.pdf
labels:
  manual: Benutzerhandbuch
  app_version: App-Version
  edition: Ausgabe
  lang_name: Deutsch
  contents: Inhalt
  figure: Abbildung
  tip: Tipp
  warning: Achtung
  note: Gut zu wissen
  glossary: Glossar
  glossary_intro: "Begriffe aus diesem Handbuch mit der Bezeichnung, die Sie auf dem Bildschirm sehen – auf Englisch und auf Luxemburgisch. Die App selbst gibt es in diesen beiden Sprachen."
  term: Begriff
  en_screen: Bildschirm (Englisch)
  lb_screen: Bildschirm (Lëtzebuergesch)
  meaning: Bedeutung
  index: Stichwortverzeichnis
  page_abbr: S.
index_terms:
  - Abwesend = abwesend
  - Adresse = Adressen?
  - Gürtelprüfung = Gürtelprüfungen?
  - Kontoauszug = Kontoauszugs?|CAMT\.053
  - Rechnungsempfänger = Rechnungsempfänger|Rechnung erhält
  - Kalender = Kalenders?
  - Kartenvorlage = Vorlagen?
  - Club-Admin = Club-Admins?
  - Vereinsprofil = Club profile
  - Trainer = Trainern?s?
  - Trainervergütung = Vergütung|Coach pay
  - Vorstand = Vorstands?|Vorstandsamt
  - Gutschrift = Gutschriften?
  - CSV-Datei = CSV
  - Mitglied löschen = löschen|Löschen
  - E-Mail = E-Mails?
  - Ausgaben = Ausgaben?
  - Familie = Familien?
  - Familienrabatt = Rabatte?|Familienrabatt
  - Grad = Grade?n?
  - Ferien = Ferien|Feiertage
  - Import = Import|importieren
  - Inaktives Mitglied = inaktiv
  - Einnahmen = Einnahmen
  - Rechnung = Rechnungen?
  - Sprache = Sprache
  - Lizenz = Lizenzen?
  - Lizenzkarte = Karten?|Lizenzkarten?
  - Lizenzgebühr = Lizenzgebühr
  - Mitgliedsbeitrag = Mitgliedsbeiträge?|Beiträge?
  - MyGuichet
  - Bestellfenster = Bestellfenster
  - Eltern = Eltern|Vormund
  - Passwort = Passw(ort|örter)
  - Zahlung = Zahlungen?
  - Foto = Fotos?
  - Druckerprofil = Druckerprofile?|Versatz
  - Druckpaket = Druckpaket|Post
  - Beförderungsregel = Beförderung|Pflichtstunden
  - Veröffentlichungseinwilligung = Einwilligung
  - Qualité+ = Qualité\+
  - QR-Etikett = Etiketten?
  - Erinnerung = Erinnerungen?
  - Berichte = Berichte?
  - Rolle = Rollen?
  - Anwesenheitsliste = Anwesenheit(sliste)?
  - Vereinsshop = Shop|Verkauf am Tresen
  - Anmelden = anmelden|Anmeldung
  - Lagerbestand = Bestand|Lager
  - Subventionen = Subventionen|Zuschuss
  - Stundenplan = Stundenplan
  - Transfer = Transfers?
  - Kassierer = Kassierer
  - Benutzername = Benutzernamen?
  - Sichtbarkeit = Sichtbarkeit|wer.*sieht
  - Datenschutz = Datenschutz|DSGVO|GDPR
  - Saison = Saison
imprint: |
  <p><strong>LTF Dojang Hub – Benutzerhandbuch</strong><br>Ausgabe Oktober 2026, für App-Version 0.12.0.</p>
  <p>Herausgegeben für die Vereine der Luxemburger Taekwondo-Föderation (LTF). Erhältlich auf Englisch, Deutsch, Französisch und Luxemburgisch.</p>
  <p>Alle Bildschirmfotos stammen aus einer Demo-Installation mit erfundenen Vereinen, Personen und Beträgen. Ähnlichkeiten mit realen Personen sind zufällig.</p>
  <p>Die App ist auf Englisch und Luxemburgisch verfügbar. Dieses Handbuch zeigt die <strong>englischen Bildschirmtexte</strong> in <span class="ui">blauen Kästchen</span> – genau so, wie sie in der App stehen. Das Glossar am Ende nennt zu jedem wichtigen Begriff auch die luxemburgische Bezeichnung.</p>
  <p>Die App wird laufend verbessert. Sieht Ihr Bildschirm anders aus als in diesem Handbuch, gilt der Bildschirm – bitte melden Sie es der LTF, damit die nächste Ausgabe angepasst wird.</p>
---

# Willkommen {#welcome}

LTF Dojang Hub ist das gemeinsame Online-Büro der Luxemburger Taekwondo-Föderation und ihrer Vereine. Die Vereine führen ihre Mitgliederliste, bestellen Lizenzen, erfassen die Anwesenheit im Training, rechnen Mitgliedsbeiträge ab und betreiben ihren Shop. Der Verband prüft Lizenzen, druckt Lizenzkarten und führt seine Bücher. Alle teilen einen Kalender. Sie ist ein Verwaltungswerkzeug für die Mitarbeitenden der Vereine und des Verbands; Mitglieder und Eltern melden sich nicht an.

## Für wen ist dieses Handbuch? {#audience}

Das Handbuch ist nach **Aufgaben** gegliedert, nicht nach Bildschirmseiten. Lesen Sie die ersten beiden Kapitel und springen Sie dann zum Kapitel für Ihre Rolle.

| Sie sind … | Lesen Sie |
|---|---|
| Trainer | [Erste Schritte](#getting-started), dann [Trainer](#coaches) und [Kalender](#calendar) |
| Club-Admin (Präsident, Sekretär, Kassierer, Ehrenamtliche) | Kapitel 2 bis 10 – beginnen Sie mit [Das Vereinsjahr auf einen Blick](#club-year) |
| im Büro der LTF tätig | [LTF Admin](#ltf-admin) oder [LTF Finance](#ltf-finance) |
| technischer Administrator | [Module (technischer Administrator)](#ops) |

Mitglieder und Eltern brauchen dieses Handbuch nicht: Sie haben keinen Login, und ihr Verein pflegt ihre Daten.

## So lesen Sie dieses Handbuch {#conventions}

- Wörter in einem blauen Kästchen, wie [[Common.signOut]], sind die **genauen Bezeichnungen auf dem Bildschirm** (auf Englisch, wie in der App).
- Pfade wie [[Common.navGroupClubManagement]] › [[navFinance]] › [[navBilling]] zeigen, wo Sie klicken – vom Menü links bis zum Reiter oben.
- Nummerierte Schritte führen Sie der Reihe nach aus. Eine Zeile mit Häkchen sagt, was Sie danach sehen sollten.
- Rote nummerierte Kreise in einem Bildschirmfoto werden in der Liste unter dem Bild erklärt.

> [!TIP]
> Tipps sparen Ihnen Zeit.

> [!WARNING]
> „Achtung“-Kästen schützen Sie vor Fehlern, die sich schwer rückgängig machen lassen.

> [!NOTE]
> „Gut zu wissen“-Kästen erklären, warum sich die App so verhält.

# Erste Schritte {#getting-started}

Sie brauchen nur einen Webbrowser auf Computer, Tablet oder Smartphone. Es muss nichts installiert werden.

## Anmelden {#sign-in}

Öffnen Sie die Adresse, die Sie von der LTF erhalten haben. Die Anmeldeseite erscheint.

![Die Anmeldeseite](fig:signin)

<div class="legend" markdown="1">
1. Sprachwahl – wählen Sie vor der Anmeldung Englisch oder Luxemburgisch.
2. [[Auth.username]] (Benutzername)
3. [[Auth.password]] (Passwort)
4. [[Auth.submit]] – meldet Sie an.
</div>

So melden Sie sich an:
{: .proc}

1. Geben Sie Ihren Benutzernamen in [[Auth.username]] ein. Er steht in der Willkommens-E-Mail, zum Beispiel `anne.reding`.
2. Geben Sie Ihr Passwort in [[Auth.password]] ein.
3. Klicken Sie auf [[Auth.submit]].

Sie landen auf der Startseite Ihrer Rolle, zum Beispiel auf der Vereinsübersicht oder der Verbandsübersicht.
{: .result}

> [!NOTE]
> Eine öffentliche Registrierung gibt es nicht. Logins entstehen, wenn jemand Club-Admin oder Trainer wird (siehe [Club-Admins](#club-admins) und [Reiter Trainer](#coaches-tab)), oder durch die LTF.
>
> Mitglieder und Eltern erhalten keinen Login.

## Ihr erstes Passwort {#first-password}

Mit Ihrem Login erhalten Sie eine Willkommens-E-Mail mit einem **Link zum Festlegen des Passworts**.

1. Klicken Sie auf den Link in der E-Mail. Die Seite [[Reset.title]] öffnet sich; Ihr [[Reset.usernameLabel]] ist bereits ausgefüllt.
2. Geben Sie ein neues Passwort in [[Reset.passwordLabel]] und noch einmal in [[Reset.confirmPasswordLabel]] ein.
3. Klicken Sie auf [[Reset.submit]] und dann auf [[Reset.continueToLogin]].

> [!TIP]
> Lassen Sie Ihren Browser oder Passwort-Manager den Benutzernamen zusammen mit dem neuen Passwort speichern. Genau deshalb füllt die Seite den Benutzernamen vor.

## E-Mail-Adresse bestätigen {#verify-email}

Meldet die Anmeldeseite, dass Ihre E-Mail noch nicht bestätigt ist, öffnen Sie die Bestätigungs-E-Mail und klicken Sie auf den Link. Keine E-Mail erhalten? Klicken Sie unter der Anmeldeschaltfläche auf [[Auth.verifyLink]], geben Sie Ihre E-Mail-Adresse ein und klicken Sie auf [[Verify.submit]].

## Passwort vergessen {#forgotten-password}

Die Anmeldeseite hat keinen Link „Passwort vergessen“. Wenden Sie sich an Ihren Club-Admin oder an die LTF: Der technische Administrator kann Ihnen eine neue Passwort-E-Mail senden. Konnte die Willkommens-E-Mail für einen neuen Club-Admin nicht verschickt werden, zeigt die App zudem einen [[adminResetLink]] auf dem Bildschirm an.

## Datenschutz und Ihre Daten {#privacy}

Die App hat eine Seite, auf der Sie Ihre Einwilligung und Ihre Datenschutzrechte selbst verwalten. Sie steht nicht im Menü; Sie öffnen sie über ihre Adresse.
{: .lead}

1. Melden Sie sich an.
2. Ersetzen Sie in der Adresszeile des Browsers alles nach der Adresse der App durch `/en/settings/privacy` (oder `/lb/settings/privacy`) und drücken Sie die Eingabetaste. Beispiel: `https://<Adresse der App>/en/settings/privacy`.

![Die Datenschutzseite {small}](fig:privacy)

Die Seite <span class="ui">Privacy &amp; GDPR</span> hat drei Bedienelemente:

- <span class="ui">I consent to data processing.</span> (Ich willige in die Datenverarbeitung ein) – Häkchen setzen oder entfernen. Die Änderung wird sofort gespeichert.
- <span class="ui">Export my data</span> – zeigt Ihre Daten auf der Seite unter <span class="ui">Export preview</span>: Ihre Login-Daten und, wenn Ihr Login mit einem Mitgliedsdatensatz verknüpft ist, Name, Grad und Verein dieses Mitglieds, die Lizenzen, den Lizenz- und Gradverlauf sowie Angaben zum Foto. Die Daten werden nur angezeigt, nicht als Datei heruntergeladen.
- <span class="ui">Delete my data</span> – löscht Ihren Login.

> [!WARNING]
> <span class="ui">Delete my data</span> fragt nicht nach. Ihr Login wird sofort gelöscht, und Sie werden abgemeldet. Ist der Login mit einem Mitgliedsdatensatz verknüpft, wird das Profilfoto entfernt und die Notizen im Gradverlauf werden geleert; der Mitgliedsdatensatz und seine Lizenzen bleiben beim Verein.

> [!NOTE]
> Diese Seite wird derzeit überprüft. Ihr Text ist vorerst nur auf Englisch, auch wenn Sie die App auf Luxemburgisch nutzen.

## Der Bildschirm auf einen Blick {#screen}

Jede Seite hat denselben Rahmen: das Menü links, eine Leiste oben und den Arbeitsbereich in der Mitte.

![Die Vereinsübersicht mit den wichtigsten Bildschirmbereichen](fig:shell)

<div class="legend" markdown="1">
1. **Menü**, gegliedert unter Überschriften wie [[Common.navGroupClub]], [[Common.navGroupClubManagement]] und [[Common.navGroupCalendar]]. Sie sehen nur, was Ihre Rolle und die Module Ihres Vereins erlauben.
2. **Vereinsauswahl** – betreuen Sie mehrere Vereine, wählen Sie hier den Verein. Alle Seiten zeigen dann diesen Verein.
3. Ihr Name, Ihr Benutzername und Ihr **Rollenabzeichen**, zum Beispiel [[Common.roleClubAdmin]].
4. **Sprache** – wechseln Sie jederzeit zwischen [[Common.languageEnglish]] und [[Common.languageLux]].
5. [[Common.signOut]] (Abmelden)
6. [[Common.sidebarCollapse]] – macht das Menü schmal, damit Tabellen mehr Platz haben. Daneben steht die App-Version.
</div>

> [!TIP]
> Auf dem Smartphone klappt das Menü ein. Tippen Sie oben links auf die Menüschaltfläche, um es zu öffnen.

## Rollen: wer darf was? {#roles}

Ihre Rolle bestimmt, welches Menü Sie sehen. Pro Login gibt es genau eine Rolle.

| Rollenabzeichen | Typische Person | Hauptaufgaben |
|---|---|---|
| [[Common.roleCoach]] | Trainer | sieht die Trainingswoche, erfasst die Anwesenheit, sieht den Kalender |
| [[Common.roleClubAdmin]] | Präsident, Sekretär, Kassierer, Ehrenamtliche | führt den Verein: Mitglieder, Lizenzen, Finanzen, Training, Shop |
| [[Common.roleLtfAdmin]] | Verbandsbüro | Vereine, Lizenzen, Karten, Transfers, Verbandskalender |
| [[Common.roleLtfFinance]] | Verbandskassierer | Bestellungen, Rechnungen, Zahlungen und Bücher des Verbands |
| [[Common.roleSuperuser]] | technischer Administrator | Module, Benutzer, Systemzustand |

> [!NOTE]
> **Mitglieder und Eltern haben keinen Login.** LTF Dojang Hub ist derzeit ein Verwaltungswerkzeug für die Mitarbeitenden der Vereine und des Verbands. Der Verein pflegt die Daten seiner Mitglieder und ihrer Eltern und beantwortet ihre Fragen. Ein Zugang für Mitglieder kann später folgen.

Was jede Vereinsrolle im Vereinsmenü sieht:

| Seite | Trainer | Club-Admin |
|---|---|---|
| [[navTraining]] | ja ¹ | ja |
| [[Events.calendarTitle]] | ja | ja |
| [[navOverview]], [[navMembers]], [[navLicenses]], [[navPrintJobs]], [[navTransfers]], [[navPromotion]] | – ² | ja |
| [[navFinance]], [[navFamilies]], [[navShop]] | – | ja |
| [[navClubAdmins]], [[navSettings]] | – | ja |
{: .matrix}

¹ Trainer sehen die Woche, erfassen die Anwesenheit und wählen, wer die Einheit geleitet hat. Stundenplan, Ferien, Vergütungssätze und Beförderungsregeln ändern nur Club-Admins. ² Diese Seiten erscheinen im Menü eines Trainers, sind für Trainer aber noch nicht eingerichtet. Ein Trainer, der zugleich Club-Admin ist, nutzt sie als Club-Admin.

> [!NOTE]
> Für das Erfassen von Zahlungen gilt eine strengere Regel: Dafür braucht man ein aktuelles Vorstandsamt. Siehe [Wer darf Zahlungen erfassen?](#payment-permission).

## Module: warum Menüpunkte fehlen können {#modules}

Teile der App schaltet die LTF pro Verein als Module frei:

- **Vereinsverwaltung** (Club management) ergänzt [[navFinance]], [[navFamilies]], [[navTraining]], [[navPromotion]] und [[navShop]] unter [[Common.navGroupClubManagement]].
- **Veranstaltungskalender** (Event calendar) ergänzt [[Events.calendarTitle]] unter [[Common.navGroupCalendar]].

Auch ohne Modul haben Sie die Seiten unter [[Common.navGroupClub]]: Mitglieder, Lizenzen, Druck und Transfers. Fehlt Ihnen ein Modul, fragen Sie die LTF.

# Trainer {#coaches}

<p class="roles"><span class="chip">Trainer</span></p>

Ein Club-Admin ernennt Sie unter [[navSettings]] › [[clubSettingsTrainersTab]] zum Trainer. Danach erhalten Sie einen Login mit dem Abzeichen [[Common.roleCoach]].

> [!NOTE]
> Die Trainerrolle wird noch ausgebaut. Dieses Kapitel beschreibt, was für Trainer heute funktioniert: die Trainingswoche, die Anwesenheit und den Kalender. Weitere Trainerfunktionen sind geplant.

## Ihre Woche {#coach-week}

Öffnen Sie [[navTraining]]. Der Reiter [[trainingThisWeek]] listet alle Einheiten der Woche mit Status und Trainern.

![Die Trainingswoche eines Trainers](fig:coach-week)

## Anwesenheit erfassen {#roll}

Erledigen Sie das während oder direkt nach dem Training. Es dauert weniger als eine Minute.
{: .lead}

![Anwesenheit für eine Einheit erfassen](fig:roll)

<div class="legend" markdown="1">
1. [[trainingSessionCoaches]] – Trainer hinzufügen oder entfernen, die tatsächlich unterrichtet haben.
2. Altersfilter wie [[trainingAge_all]] – sie kürzen nur die Liste; jedes aktive Mitglied darf teilnehmen.
3. [[trainingOnTheRoll]] – die als anwesend markierten Schüler.
4. [[trainingMarkShown]] – markiert alle Personen der aktuellen Liste auf einmal.
5. [[trainingSaveRoll]]
6. [[trainingAddStudents]] – suchen Sie alle anderen, die gekommen sind.
</div>

1. Klicken Sie unter [[navTraining]] › [[trainingThisWeek]] neben der Einheit auf [[trainingOpenRoll]].
2. Die Stammschüler stehen schon auf der Liste. Klicken Sie auf einen Namen, um ihn zu entfernen, wenn die Person gefehlt hat.
3. Haken Sie unter [[trainingAddStudents]] alle weiteren Anwesenden an. Bei langen Listen hilft die Suche.
4. Prüfen Sie [[trainingSessionCoaches]].
5. Klicken Sie auf [[trainingSaveRoll]].

Die Einheit erscheint nun als [[trainingStatus_held]]. Ihre Stunden zählen für den nächsten Gürtel jedes Schülers (siehe [Beförderung](#promotion)) und für die Trainervergütung.
{: .result}

> [!TIP]
> Erfassen Sie die Anwesenheit am Mattenrand mit dem Smartphone. Die Seite ist für kleine Bildschirme gemacht.

## Kalender für Trainer {#coach-calendar}

Trainer sehen öffentliche Vereinstermine und zusätzlich [[calendarVisibility_internal]]-Termine. So kann der Verein Trainerbesprechungen nur mit seinen Trainern und Admins teilen. Siehe [Kalender](#calendar).

# Club-Admin: Mitglieder und Lizenzen {#club-members}

<p class="roles"><span class="chip">Club-Admin</span></p>

## Vereinsübersicht {#club-overview}

[[navOverview]] ist Ihr Cockpit. Es zählt Mitglieder, Lizenzen und offene Rechnungen. Die [[actionQueueTitle]] (Aufgabenliste) zeigt, was auf Sie wartet – jeweils mit einer Schaltfläche, die die richtige Seite öffnet.

![Die Vereinsübersicht](fig:club-overview)

<div class="legend" markdown="1">
1. [[refreshAction]] – lädt die Zahlen neu.
2. [[actionQueueTitle]] – steht dort „All clear“, wartet nichts auf Sie.
</div>

## Die Mitgliederliste {#members-list}

[[navMembers]] listet alle Mitglieder Ihres Vereins.

![Die Mitgliederliste](fig:members-list)

<div class="legend" markdown="1">
1. Suche nach Namen.
2. Filter: [[filterAllTitle]] / [[filterActiveTitle]] / [[filterInactiveTitle]] (alle, aktive, inaktive).
3. Das Menü [[membersMenuLabel]]: Mitglieder anlegen oder importieren.
4. [[Common.batchActionsLabel]] für die angehakten Mitglieder.
5. Kästchen, um ein Mitglied auszuwählen.
6. Ein einzelnes Mitglied löschen.
</div>

Ein Klick auf einen Namen öffnet das Mitglied. Das Menü [[Common.batchActionsLabel]] wirkt auf alle angehakten Mitglieder gleichzeitig:

![Aktionen für ausgewählte Mitglieder](fig:members-actions)

<div class="legend" markdown="1">
1. [[actionPrintCards]] – siehe [Lizenzkarten drucken](#print-cards).
2. [[actionOrderLicense]] – siehe [Lizenzen bestellen](#order-licences).
3. [[actionChangeStatus]] – Mitglieder aktiv oder inaktiv setzen.
</div>

> [!WARNING]
> Setzen Sie ein Mitglied lieber auf **inaktiv**, statt es zu löschen. Beim Löschen werden auch seine Lizenzen gelöscht; ein inaktives Mitglied behält seine Historie.

## Ein Mitglied anlegen {#add-member}

1. Öffnen Sie unter [[navMembers]] das Menü [[membersMenuLabel]] und klicken Sie auf [[createMember]].
2. Füllen Sie [[firstNameLabel]], [[lastNameLabel]], [[sexLabel]] und [[dobLabel]] aus.
3. Wählen Sie das [[ltfLicensePrefixLabel]]. Die LTF-Lizenznummer selbst wird beim Speichern automatisch vergeben. Füllen Sie [[Import.wtLicenseLabel]] nur aus, wenn der Sportler bereits eine World-Taekwondo-Lizenz hat.
4. Den Gürtelgrad tragen Sie nach dem Speichern im Reiter [[memberGradesTab]] ein.
5. Klicken Sie auf [[createMember]].

![Ein Mitglied anlegen](fig:member-new)

## Mitglieder aus einer Tabelle importieren {#import}

Nutzen Sie das einmal beim Start Ihres Vereins mit der App oder um eine ganze Gruppe hinzuzufügen.
{: .lead}

1. Speichern Sie Ihre Liste als CSV-Datei (eine Zeile pro Person, eine Spalte pro Feld).
2. Öffnen Sie unter [[navMembers]] das Menü [[membersMenuLabel]] und klicken Sie auf [[Import.importMembers]].
3. [[Import.sourceStepTitle]]: Wählen Sie das [[Import.dateFormatLabel]] Ihrer Datei und klicken Sie auf [[Import.chooseFileButton]]. Klicken Sie auf [[Import.continueToMapping]].
4. [[Import.mappingStepTitle]]: Wählen Sie für jedes Feld der App die passende Spalte Ihrer Datei. [[Import.autoMapButton]] erledigt das meiste. Alle mit [[Import.requiredBadge]] markierten Felder müssen zugeordnet sein.
5. [[Import.previewStepTitle]]: Klicken Sie auf [[Import.previewButton]]. Jede Zeile ist [[Import.statusReady]], [[Import.statusDuplicate]], [[Import.statusInvalid]] oder [[Import.statusSkipped]]. Korrigieren Sie Ihre Datei oder ändern Sie die Aktion für eine Zeile.
6. [[Import.confirmStepTitle]]: Klicken Sie auf [[Import.startImport]].
7. [[Import.resultStepTitle]] zeigt, was angelegt wurde.

![Schritt 1 des Import-Assistenten](fig:import)

> [!TIP]
> Enthält Ihre Datei eine Spalte mit dem Ende der Mitgliedschaft, nutzen Sie [[Import.membershipYearRulesLabel]]: aktuelle Mitglieder werden aktiv importiert, wer vor Jahren ausgetreten ist, wird übersprungen.

## Der Mitgliedsdatensatz {#member-record}

Die Seite eines Mitglieds hat sechs Reiter.

![Die Seite eines Mitglieds](fig:member-detail)

<div class="legend" markdown="1">
1. [[memberOverviewTab]] – Name, Geburtsdatum, Lizenznummern, Gürtel.
2. [[memberClubRecordTab]] – was nur der Verein braucht (siehe unten).
3. [[memberCurrentLicensesTab]] – die Lizenz dieses Jahres mit Kartenvorschau.
4. [[memberLicenseHistoryTab]] (Lizenzhistorie)
5. [[memberGradesTab]] (Grade)
6. [[memberClubMovementsTab]] – Wechsel zwischen Vereinen.
7. Übersichtsdaten bearbeiten.
8. [[photoChangeButton]] – öffnet den Foto-Editor (siehe [Das Foto eines Mitglieds](#member-photo)).
9. [[downloadStatementAction]] – ein PDF mit den Rechnungen und Zahlungen des Mitglieds.
</div>

### Die Vereinsakte {#club-record}

[[memberClubRecordTab]] enthält die Angaben, die der Verein im Alltag braucht. Alles ist freiwillig; füllen Sie aus, was Sie nutzen.

![Die Vereinsakte](fig:member-record)

<div class="legend" markdown="1">
1. [[ClubMgmt.paysLicenseFee]] – Häkchen entfernen, wenn ein Mitglied die Lizenzgebühr des Vereins nicht zahlen soll.
2. [[ClubMgmt.memberFeeLabel]] – welcher Mitgliedsbeitrag berechnet wird; ohne Änderung gilt [[ClubMgmt.memberFeeDefault]].
3. [[ClubMgmt.deliveryLabel]] – [[ClubMgmt.deliveryEmail]], [[ClubMgmt.deliveryPost]] oder [[ClubMgmt.deliveryHand]] (persönlich).
4. [[ClubMgmt.contacts]] – Eltern, Vormund, Notfallkontakte.
</div>

Dazu kommen [[ClubMgmt.ssn]], [[ClubMgmt.joinedAt]], zwei Staatsangehörigkeiten, [[ClubMgmt.medicalNotes]], [[ClubMgmt.emails]], [[ClubMgmt.phones]], [[ClubMgmt.addresses]], [[ClubMgmt.mediaConsent]] und die Termine der [[ClubMgmt.checkups]]. Klicken Sie zum Schluss auf [[ClubMgmt.saveRecord]].

> [!TIP]
> Tragen Sie bei einem Kind den Elternteil unter [[ClubMgmt.contacts]] ein und setzen Sie das Häkchen bei [[ClubMgmt.alsoForFamily|name=the family]] – so gilt derselbe Elternteil auch für die Geschwister.

### Das Foto eines Mitglieds {#member-photo}

Das Foto wird auf die Lizenzkarte gedruckt – ein gutes Foto erspart einen Neudruck.

1. Öffnen Sie das Mitglied und klicken Sie auf [[photoChangeButton]].
2. Ziehen Sie ein Bild in das Feld, klicken Sie auf [[photoSelectFileButton]] oder auf [[photoCameraButton]] und dann auf [[photoCameraCaptureButton]].
3. Stellen Sie mit [[photoZoomLabel]] die Größe ein und verschieben Sie das Bild, bis das Gesicht den 8:10-Rahmen füllt. Der Bereich [[photoPreviewTitle]] zeigt das Ergebnis.
4. Klicken Sie bei Bedarf auf [[photoRemoveBackgroundButton]] und wählen Sie unter [[photoBackgroundColorLabel]] eine Farbe.
5. Setzen Sie das Häkchen bei [[photoConsentLabel]].
6. Klicken Sie auf [[photoSaveButton]].

> [!TIP]
> Eine einfarbige Wand, gutes Licht und ein gerader Blick in die Kamera ergeben das beste Ergebnis. Angenommen werden JPEG-, PNG- und HEIC-Fotos bis 10 MB.

## Lizenzen bestellen {#order-licences}

Jeder Sportler braucht jedes Jahr eine LTF-Lizenz. Sie bestellen Lizenzen für mehrere Mitglieder auf einmal; die LTF stellt Ihrem Verein dann eine Rechnung.
{: .lead}

1. Haken Sie unter [[navMembers]] die Mitglieder an, die eine Lizenz brauchen.
2. Öffnen Sie [[Common.batchActionsLabel]] und klicken Sie auf [[actionOrderLicense]].
3. Wählen Sie das [[yearLabel]]. Je nach Verbandsregel können Sie für dieses Jahr bestellen oder für nächstes Jahr vorbestellen.
4. Klicken Sie unter [[orderLicenseAvailableTypesTitle]] auf einen Lizenztyp mit dem Vermerk [[orderLicenseStatusAvailable]].
5. Prüfen Sie [[orderLicenseReviewTitle]]. Mitglieder, die diese Lizenz schon haben, stehen unter [[orderLicenseAlreadyLicensedTitle]]; klicken Sie bei Bedarf auf [[orderLicenseResolveDuplicatesAction]] oder [[orderLicenseResolveBlockedAction]].
6. Klicken Sie auf [[orderLicenseButton|year=2026]].

Die Seite zeigt [[orderLicenseSuccessTitle]]. Die Lizenzen bleiben [[statusPending]] (ausstehend), bis die LTF Ihre Zahlung erhalten und sie aktiviert hat.
{: .result}

![Lizenzen für zwei Mitglieder bestellen](fig:order-licenses)

> [!NOTE]
> Kann ein Lizenztyp nicht gewählt werden, steht der Grund dabei, zum Beispiel [[orderLicenseUnavailableReasonWindow]] oder [[orderLicenseUnavailableReasonNoPrice]]. Bestellfenster und Preise legt die LTF fest.

Bestellung und Rechnung erscheinen unter [[navFinance]] › [[navOrders]] und [[navInvoices]]. Bezahlen Sie die Verbandsrechnung wie unter [Die LTF bezahlen](#pay-ltf) beschrieben.

## Die Lizenzliste {#licences}

[[navLicenses]] zeigt alle Lizenzen des Vereins mit Status: [[filterActiveTitle]], [[filterPendingTitle]] oder [[filterExpiredTitle]] (aktiv, ausstehend, abgelaufen). Suchen Sie nach Mitglied, Jahr oder Status. Haken Sie Lizenzen an und nutzen Sie [[Common.batchActionsLabel]] › [[actionPrintCards]], um ihre Karten zu drucken.

![Die Lizenzliste](fig:licences)

## Lizenzkarten drucken {#print-cards}

1. Haken Sie die Mitglieder (unter [[navMembers]]) oder Lizenzen (unter [[navLicenses]]) an, deren Karten Sie drucken möchten.
2. Öffnen Sie [[Common.batchActionsLabel]] und klicken Sie auf [[actionPrintCards]]. Die Seite [[quickPrintTitle]] öffnet sich.
3. Prüfen Sie [[quickPrintTemplateLabel]] und [[quickPrintPaperProfileLabel]]. Wählen Sie ein [[quickPrintPrinterProfileLabel]], wenn Ihr Drucker einen Versatz braucht.
4. Drucken Sie auf einen schon angebrochenen Bogen? Klicken Sie unter [[quickPrintSlotPickerTitle]] auf die freien Felder.
5. Klicken Sie auf [[quickPrintCreateAction]].
6. Öffnen Sie [[quickPrintOpenHistoryAction]] und klicken Sie auf [[printJobDownloadPdfAction]], sobald der Auftrag [[printJobStatusSucceeded]] zeigt. Drucken Sie das PDF in 100 % (ohne „An Seite anpassen“).

![Schnelldruck](fig:print-jobs)

> [!TIP]
> Sitzt der Druck einige Millimeter daneben, bitten Sie die LTF um ein Druckerprofil mit dem passenden X/Y-Versatz, statt das Kartendesign zu ändern.

## Transfers zwischen Vereinen {#transfers}

Wechselt ein Mitglied den Verein, **schickt** der alte Verein es ab und der neue **nimmt es an**. Lizenz und Historie wandern mit.
{: .lead}

So schicken Sie ein Mitglied an einen anderen Verein:
{: .proc}

1. Öffnen Sie [[navTransfers]].
2. Klicken Sie links auf das Mitglied und rechts auf den Zielverein. Mit den Suchfeldern finden Sie beide schneller.
3. Geben Sie einen [[transferFeeAmountLabel]] ein, wenn Ihr Verein eine Ablöse verlangt, oder lassen Sie 0 für einen kostenlosen Transfer; fügen Sie eine Notiz hinzu.
4. Klicken Sie auf [[transferSendRequest]].

![Mitglied und neuen Verein wählen](fig:transfers)

So beantworten Sie eine Anfrage eines anderen Vereins:
{: .proc}

1. Öffnen Sie [[navTransfers]]. Eingehende Anfragen stehen unter [[transferInboxTitle]] › [[transferIncomingLabel]].
2. Klicken Sie auf die Anfrage. Lesen Sie die Nachrichten; mit [[transferSendMessage]] stellen Sie eine Rückfrage.
3. Klicken Sie auf [[transferAcceptAction]] oder [[transferRejectAction]].

![Einen eingehenden Transfer beantworten](fig:transfers-in)

<div class="legend" markdown="1">
1. Nachricht an den anderen Verein schreiben.
2. [[transferSendMessage]]
3. [[transferAcceptAction]] (annehmen)
4. [[transferRejectAction]] (ablehnen)
</div>

> [!NOTE]
> Der abgebende Verein kann seine Anfrage zurückziehen, solange der andere Verein nicht geantwortet hat. Nur Vereine mit einem Club-Admin können Transfers empfangen.

# Club-Admin: Finanzen {#club-money}

<p class="roles"><span class="chip">Club-Admin</span><span class="chip">Modul Vereinsverwaltung</span></p>

Unter [[navFinance]] finden Sie die Bücher des Vereins. Die Reiter oben heißen: [[navOrders]], [[navInvoices]], [[navPayments]], [[navBilling]], [[navMembershipFees]], [[navIncome]], [[navExpenses]], [[navBank]], [[navReports]] und [[navSubsidies]].

> [!NOTE]
> Die Vereinsbücher enthalten zwei Arten von Rechnungen: **LTF-Rechnungen** (Lizenzen, die Ihr Verein beim Verband kauft) und **Vereinsrechnungen** (Mitgliedsbeiträge und Shopverkäufe an Ihre Mitglieder). Der Filter [[financeLedgerLabel]] unter [[navInvoices]] schaltet zwischen beiden um.

## Wer darf Zahlungen erfassen? {#payment-permission}

Zahlungen und andere Änderungen an den Vereinsbüchern erfordern ein **aktuelles Vorstandsamt**: [[paymentsRecordDenied]] Halten Sie den Vorstand unter [[navSettings]] › [[clubSettingsCommitteeTab]] aktuell (siehe [Vorstand](#committee)).

## Familien und Rabatte {#families}

Eine Familie fasst Mitglieder eines Haushalts zusammen: Sie erhalten eine gemeinsame Rechnung und Familienrabatte.

1. Öffnen Sie [[navFamilies]]. Geben Sie einen [[familyName]] ein und klicken Sie auf [[createFamily]].
2. Öffnen Sie die Familie und fügen Sie die Mitglieder **in Rabattreihenfolge** hinzu: Rang 1 zahlt den vollen Preis, Rang 2 erhält den Rabatt für das zweite Mitglied und so weiter.
3. Wählen Sie unter [[receivesTheBill]], wer die Rechnung erhält, oder klicken Sie auf [[addParentOrGuardian]] für einen Elternteil, der kein Mitglied ist.
4. Wählen Sie die [[deliveryLabel]]. [[billToDeliveryAuto]] ist eine sichere Voreinstellung.

![Familien](fig:families)

Mit [[familyInvoicePreview]] prüfen Sie die Beträge vor der Abrechnung.

## Mitgliedsbeiträge {#fees}

[[navMembershipFees]] ist die Preisliste. Sie richten sie einmal ein; sie gilt im nächsten Jahr weiter.

1. Geben Sie unter [[membershipFee]] einen [[feeName]] (zum Beispiel „Erwachsene“) und einen [[feeAmount]] ein und klicken Sie auf [[saveFee]]. Legen Sie einen Beitrag pro Beitragsart an, etwa Kinder, Erwachsene, Familie.
2. Ändert sich ein Preis, legen Sie **keinen** neuen Beitrag an: Öffnen Sie den Beitrag, geben Sie den neuen Betrag und das Datum [[priceFrom]] ein und klicken Sie auf [[saveNewPrice]].
3. Legen Sie unter [[licenseFeeTitle]] den Betrag fest, den Sie den Mitgliedern für die LTF-Lizenz berechnen, oder lassen Sie 0.00.
4. Klicken Sie unter [[billingsTitle]] nur dann auf [[addBilling]], wenn Sie den Mitgliedsbeitrag mehrmals im Jahr abrechnen (zum Beispiel im Frühjahr). Wählen Sie dann unter [[licenseFeeBilling]], auf welcher Rechnung die Lizenzgebühr steht – siehe [Wann die Lizenzgebühr berechnet wird](#license-fee-season).
5. Klicken Sie unter [[rebateRules]] für Rang 2, 3 … auf [[addRebate]]. Wählen Sie [[rebateKindPercent]] oder [[rebateKindAmount]]. Setzen Sie das Häkchen bei [[rebateAppliesToLater]], damit jedes weitere Kind denselben Rabatt erhält.

![Mitgliedsbeiträge](fig:fees)

> [!NOTE]
> Die Lizenzgebühr wird pro Mitglied und Saison einmal berechnet, auf der Rechnung, die unter [[licenseFeeBilling]] gewählt ist. Familienrabatte verringern sie nie.

## Das Jahr abrechnen {#billing}

Sind Beiträge und Familien eingerichtet, ist der ganze Verein mit wenigen Klicks abgerechnet.
{: .lead}

![Beitragsabrechnung](fig:billing)

<div class="legend" markdown="1">
1. Der Reiter [[navBilling]].
2. [[billingYear]] und, wenn Ihr Verein mehrmals abrechnet, die Abrechnung.
3. [[printPackAction]] – ein PDF mit allen Rechnungen für Post oder persönliche Übergabe.
4. [[reviewIssueAction]] (prüfen und ausstellen)
5. [[selectReady]]
6. Statusfilter.
7. Ein Haushalt mit dem Status [[billingBlocked]] – öffnen Sie ihn, um den Grund zu sehen.
</div>

1. Öffnen Sie [[navFinance]] › [[navBilling]] und wählen Sie das [[billingYear]].
2. Suchen Sie Haushalte mit [[billingBlocked]]. Der Grund steht in der Zeile, meist [[chooseBillRecipient]] (bei einem Kind) oder ein fehlender Mitgliedsbeitrag. Beheben Sie das unter [[navFamilies]] oder [[navMembershipFees]].
3. Klicken Sie auf [[selectReady]].
4. Klicken Sie auf [[reviewIssueAction]], prüfen Sie die Summen in der Bestätigung und klicken Sie auf [[issueInvoicesAction]].
5. E-Mail-Rechnungen werden sofort verschickt. Für die übrigen klicken Sie auf [[printPackAction]] und drucken das PDF.

Die Haushalte zeigen nun [[billingInvoiced]]. Sie wechseln zu [[billingPaid]], sobald Sie die Zahlung erfassen.
{: .result}

> [!NOTE]
> Ein Mitglied mit einem Beitrag von 0.00 erhält eine als bezahlt markierte Rechnung über 0,00 – als Nachweis der Mitgliedschaft. Sie ersetzt keine LTF-Lizenz.

## Wann die Lizenzgebühr berechnet wird {#license-fee-season}

Die Taekwondo-Saison läuft von September bis September, wie das luxemburgische Schuljahr. Die Lizenzgebühr wird normalerweise mit der **ersten Rechnung der Saison** berechnet. In der App werden die Abrechnungen aber pro Kalenderjahr gezählt ([[billingYear]]). Die erste Rechnung der Saison ist deshalb nicht immer [[billingInstallmentNumber|sequence=1]].
{: .lead}

- **Eine Rechnung im Jahr** (meist im Herbst): Sie eröffnet die Saison und enthält die Lizenzgebühr. Sie müssen nichts einstellen.
- **Zwei Rechnungen im Jahr**: Die Frühjahrsrechnung deckt die zweite Hälfte der laufenden Saison ab, die Herbstrechnung eröffnet die neue Saison. Die Herbstrechnung ist also die **zweite** Rechnung des Kalender- oder Geschäftsjahres – und sie soll die Lizenzgebühr enthalten.

Beispiel: Ein Verein rechnet im Februar und im Oktober 2026 ab.

| Rechnung | In der App | Saison | Lizenzgebühr? |
|---|---|---|---|
| Februar 2026 | [[billingInstallmentNumber|sequence=1]], Bezeichnung „Frühjahr“ | zweite Hälfte 2025/26 | nein – schon im Oktober 2025 berechnet |
| Oktober 2026 | [[billingInstallmentNumber|sequence=2]], Bezeichnung „Herbst“ | Beginn 2026/27 | ja |

So richten Sie das ein:
{: .proc}

1. Öffnen Sie [[navFinance]] › [[navMembershipFees]] und wählen Sie das [[billingYear]] im Bereich [[billingsTitle]].
2. Klicken Sie auf [[addBilling]] und geben Sie unter [[billingLabel]] eine Bezeichnung für die neue Rechnung ein, zum Beispiel „Herbst“.
3. Wählen Sie unter [[licenseFeeBilling]] den Eintrag [[billingInstallmentNumber|sequence=2]].

> [!NOTE]
> Die App beschreibt diese Regel an zwei Stellen. Unter [[navBilling]] heißt es, die Lizenzgebühr komme „on each member's first bill“ (auf die erste Rechnung des Mitglieds); unter [[navMembershipFees]] heißt es „on the billing chosen for that year“ (auf die für das Jahr gewählte Abrechnung). Gemeint ist beide Male dieselbe Rechnung: die unter [[licenseFeeBilling]] gewählte, also die erste Rechnung der Saison. Wer nach Beginn dieser Abrechnung eintritt, zahlt die Lizenzgebühr mit der nächsten Rechnung. Bereits ausgestellte Rechnungen bleiben unverändert.

## Eine Zahlung erfassen {#record-payment}

1. Öffnen Sie [[navFinance]] › [[navInvoices]] und klicken Sie neben der Rechnung auf [[recordPaymentButton]].
2. Prüfen Sie das [[paymentDateLabel]]. Voreingestellt ist heute.
3. [[paymentReferenceLabel]] (Verwendungszweck) ist mit der Rechnungsnummer vorbelegt und passt so zur Überweisung.
4. Wählen Sie die [[paymentMethodLabel]] und klicken Sie auf [[recordPaymentButton]].

![Eine Zahlung erfassen](fig:record-payment)

> [!TIP]
> Bitten Sie die Eltern, die Rechnungsnummer im Verwendungszweck anzugeben. Dann gelingt der Bankabgleich (siehe unten) fast automatisch.

## Die LTF bezahlen {#pay-ltf}

LTF-Rechnungen für Ihre Lizenzbestellungen finden Sie unter [[navInvoices]], wenn der Filter [[financeLedgerLabel]] auf LTF steht. Bezahlen Sie sie per Überweisung mit der Rechnungsnummer als Verwendungszweck. LTF Finance erfasst die Zahlung und aktiviert die Lizenzen.

> [!NOTE]
> Die Schaltfläche [[Common.payNow]] führt derzeit nur **Testzahlungen** aus. Die Online-Zahlung wird noch nicht für echte Zahlungen genutzt, und über den künftigen Zahlungsanbieter ist noch nicht entschieden. Bis dahin bezahlen Sie per Überweisung.

## Sonstige Einnahmen und Ausgaben {#income-expenses}

- [[navIncome]]: Klicken Sie auf [[recordIncomeAction]] für Zuschüsse, Spenden, Sponsoring und andere Einnahmen. Hängen Sie einen [[receiptLabel]] an, wenn vorhanden.
- [[navExpenses]]: die Seite für die eigenen Ausgaben des Vereins. Ihr Untertitel lautet [[LtfFinance.clubExpensesSubtitle]] Klicken Sie auf [[recordExpenseAction]]. Das Formular bestätigt, dass die Ausgabe auf die Konten Ihres Vereins gebucht wird, nicht auf die des Verbands: [[LtfFinance.clubExpenseFormSubtitle]] Füllen Sie [[expenseDateLabel]], [[expenseCategoryLabel]], [[expenseDescriptionLabel]], [[expensePayeeLabel]] und [[expenseAmountLabel]] aus. Setzen Sie das Häkchen bei [[expenseAlreadyPaidLabel]], wenn das Geld schon abgebucht ist, und wählen Sie die [[paymentMethodLabel]]. Einen Beleg können Sie unter [[receiptLabel]] anhängen (PDF oder Bild).

Falsch erfasst? Öffnen Sie den Eintrag und nutzen Sie [[voidIncomeAction]] oder [[voidExpenseAction]]. Stornierte Einträge bleiben für die Kassenprüfer sichtbar.

## Bankabgleich {#bank}

[[navBank]] vergleicht Ihren Kontoauszug mit den Büchern. Es gibt keine Verbindung zur Bank: Sie laden eine Datei hoch.

1. Laden Sie im Online-Banking einen Kontoauszug als CSV oder CAMT.053 herunter.
2. Wählen Sie unter [[navBank]] bei [[bankFileLabel]] die Datei und klicken Sie auf [[importStatementAction]].
3. Öffnen Sie den Auszug. Ordnen Sie jede Zeile einer Zahlung, Einnahme oder Ausgabe zu oder markieren Sie reine Bankposten wie Gebühren als ignoriert.

![Bankabgleich](fig:bank)

## Berichte für die Generalversammlung {#reports}

[[navReports]] erstellt Ergebnisrechnung, Kassenbewegung und einen Budgetvergleich für ein [[reportYearLabel]]. Geben Sie einmal pro Jahr die [[openingCashTitle]] ein und klicken Sie auf [[saveOpeningCashAction]]. [[exportExcelAction]] lädt alles als Tabelle für die Kassenprüfer herunter.

![Finanzberichte](fig:reports)

## Subventionen {#subsidies}

[[navSubsidies]] bereitet die jährliche MyGuichet-Akte für das Ministerium vor und füllt Formulare für außerordentliche Zuschüsse aus. Die App verschickt nichts: Den Antrag reichen Sie weiterhin selbst ein.
{: .lead}

![Die Seite Subventionen](fig:subsidies)

1. Wählen Sie das [[subsidiesYear]]. Die übliche Einreichfrist ist der 30. September.
2. Arbeiten Sie die Liste [[subsidiesChecklist]] ab, bis alle Punkte grün sind.
3. Laden Sie das [[subsidiesRibFile]] hoch.
4. Legen Sie unter [[subsidiesCoaches]] für jeden Trainer die [[subsidiesEqf]] fest und laden Sie das Diplom hoch. Trainer werden unter [[navSettings]] › [[clubSettingsTrainersTab]] ernannt.
5. Laden Sie die [[subsidiesTrainingList]] und die [[subsidiesTrainersList]] herunter. Der Präsident oder ein beauftragtes Vorstandsmitglied bestätigt sie.
6. Geben Sie unter [[subsidiesYouth]] die nationale Identifikationsnummer jedes Kindes ein und exportieren Sie die [[subsidiesExportYouth]].
7. Übertragen Sie die Tabelle [[subsidiesEffectifs]] in MyGuichet.
8. Tragen Sie nach der Einreichung [[subsidiesSubmittedOn]] ein, später [[subsidiesPaidOn]] und [[subsidiesPaidAmount]]. Sobald ein Präsident, Vizepräsident, Kassierer oder Sekretär die Seite das nächste Mal öffnet, wird der Betrag in die Vereinseinnahmen übernommen.

So werden die Punkte berechnet:

| Wert | Regel der App |
|---|---|
| [[subsidiesVolunteerPoints]] | weniger als 50 lizenzierte Mitglieder: 150 · 50 bis 200: 300 · mehr als 200: 500 |
| [[subsidiesCoachPoints]] | pro Trainer nach Qualifikation: EQF 1 und 2 = 20 · EQF 2 bis und 3 = 40 · EQF 4 = 60 · EQF 5 und 6 = 100 |
| [[subsidiesQualite]] | 150 € pro lizenziertem Sportler unter 16 Jahren |

Für Reisen zu einer Meisterschaft oder einem internationalen Pokal nutzen Sie [[subsidiesExtraordinary]]: [[subsidiesKind]] wählen, Sportler und Offizielle hinzufügen, Reise-, Unterkunfts- und Startgebühren eintragen, auf [[subsidiesCreateCase]] und dann auf [[subsidiesDownloadForm]] klicken.

# Club-Admin: Training und Beförderung {#club-training}

<p class="roles"><span class="chip">Club-Admin</span><span class="chip">Trainer</span><span class="chip">Modul Vereinsverwaltung</span></p>

[[navTraining]] hat sechs Reiter: [[trainingThisWeek]], [[trainingMonth]], [[trainingYear]], [[trainingTimetable]], [[trainingHolidays]] und [[trainingCoachHours]].

## Die Woche {#training-week}

![Die Trainingswoche](fig:training-week)

<div class="legend" markdown="1">
1. Die Trainingsreiter.
2. [[trainingAddSession]] – für eine Einheit in den Schulferien oder an einem Zusatztermin.
3. [[trainingOpenRoll]] – siehe [Anwesenheit erfassen](#roll).
4. [[trainingCancel]] – zum Beispiel, wenn die Halle geschlossen ist. Nur für Club-Admins.
</div>

## Den Stundenplan einrichten {#timetable}

Das erledigen Sie einmal zu Saisonbeginn. Jede Einheit wiederholt sich dann wöchentlich bis zum Enddatum.
{: .lead}

1. Öffnen Sie [[trainingTimetable]].
2. Geben Sie unter [[trainingAddClass]] [[trainingClassName]], [[trainingAudience]], [[trainingWeekday]], [[trainingStarts]] und [[trainingEnds]] sowie die Saison [[subsidiesFrom]] / [[subsidiesTo]] ein.
3. Lassen Sie [[trainingSkipPublic]] und [[trainingSkipSchool]] angehakt, wenn der Verein dann pausiert.
4. Haken Sie [[trainingCountsUnder16]] bei Einheiten an, die auf die Qualité+-Trainingsliste gehören.
5. Wählen Sie die [[trainingUsualCoaches]] und die [[trainingRegulars]]. Die Stammschüler sind bei jeder Anwesenheitsliste vorausgewählt.
6. Klicken Sie auf [[trainingAddClass]].

![Eine wöchentliche Einheit anlegen](fig:timetable)

## Ferien {#holidays}

[[trainingHolidays]] listet die luxemburgischen [[trainingPublicHolidays]] des Jahres. Ihre [[trainingSchoolHolidays]] fügen Sie mit [[trainingAddHoliday]] hinzu. Einheiten, die Ferien überspringen, fallen an diesen Tagen automatisch weg.

![Feiertage und Schulferien](fig:holidays)

## Monats- und Jahresansicht {#month-year}

[[trainingMonth]] zeigt die Einheiten als Kalender, [[trainingYear]] eine Markierung pro Einheit über die ganze Saison. Öffnen Sie einen Tag, um die Anwesenheit zu erfassen.

![Die Monatsansicht](fig:month)

## Trainervergütung {#coach-pay}

[[trainingCoachHours]] rechnet zusammen, was jedem Trainer zusteht.

1. Legen Sie [[trainingPayFrequency]] und die Zahltage fest und klicken Sie auf [[trainingSavePaydays]].
2. Wählen Sie unter [[trainingPayRateTitle]] für jeden Trainer [[trainingBasisHourly]] oder [[trainingBasisUnit]], geben Sie den [[trainingRateColumn]] ein und klicken Sie auf [[trainingSaveRate]].
3. Fügen Sie unter [[trainingOutingsTitle]] eine Zeile für ein Turnier, Benzin oder ein Hotel hinzu, das der Verein bezahlt.

![Trainervergütung](fig:coach-pay)

> [!NOTE]
> Vergütet werden nur gehaltene Einheiten (Anwesenheit gespeichert). Jeder Trainer, der bei einer Einheit eingetragen ist, erhält die ganze Einheit.

## Beförderungsregeln und Gürtelprüfungen {#promotion}

[[navPromotion]] legt fest, wie viele Trainingsstunden ein Schüler bis zum nächsten Grad braucht. Die Stunden zählen ab dem letzten Grad des Schülers.
{: .lead}

![Beförderungsregeln](fig:promotion)

So legen Sie eine Regel an:
{: .proc}

1. Wählen Sie den [[trainingNextGrade]].
2. Geben Sie die [[trainingRequiredHours]] ein.
3. Wählen Sie unter [[trainingHoursCount]] [[trainingHoursAll]] oder eine bestimmte Art von Einheit.
4. Klicken Sie auf [[trainingSaveRule]].

So führen Sie eine Gürtelprüfung durch:
{: .proc}

1. Geben Sie unter [[trainingBeltTests]] den Namen und das [[trainingDate]] ein und klicken Sie auf [[trainingAddBeltTest]].
2. Klicken Sie auf [[trainingOpenTest]]. Die Kandidaten zeigen ihre [[trainingHoursSoFar]] und ob sie [[trainingReady]] (bereit) oder [[trainingShort]] (zu wenig Stunden) sind.
3. Klicken Sie am Prüfungstag für jeden Kandidaten auf [[trainingPass]] oder [[trainingFail]].

Bei Bestehen wird der neue Grad im Reiter [[memberGradesTab]] des Mitglieds eingetragen.
{: .result}

![Eine Gürtelprüfung](fig:belt-test)

# Club-Admin: der Vereinsshop {#shop}

<p class="roles"><span class="chip">Club-Admin</span><span class="chip">Modul Vereinsverwaltung</span></p>

[[navShop]] verkauft Doboks, Gürtel und Schützer am Vereinstresen. Es gibt drei Reiter: [[shopTabSell]], [[shopTabItems]] und [[shopTabSales]].

## Einen Artikel anlegen {#shop-item}

1. Öffnen Sie [[shopTabItems]] und klicken Sie auf [[shopAddItem]].
2. Tippen Sie auf [[shopPhoto]], um mit dem Smartphone ein Foto zu machen.
3. Geben Sie [[shopItemName]], [[shopCategory]], [[shopPurchasePrice]] und [[shopSalePrice]] ein.
4. Haken Sie [[shopTrackStock]] an, wenn die App nicht mehr verkaufen soll, als im Regal liegt.
5. Klicken Sie auf [[saveItem]].
6. Fügen Sie unter [[shopSizes]] jede Größe mit eigenen Preisen und der Stückzahl [[shopOnShelfNow]] hinzu. [[shopWarnBelow]] meldet niedrigen Bestand.

![Einen Artikel mit Größen bearbeiten](fig:shop-item)

Kommt eine Lieferung, öffnen Sie den Artikel und nutzen [[shopGoodsArrived]]. Danach druckt [[shopPrintStickersNext]] QR-Etiketten auf Bögen Avery Zweckform L7121-25.

## Am Tresen verkaufen {#shop-sell}

![Der Verkauf am Tresen](fig:shop-sell)

<div class="legend" markdown="1">
1. Shop-Reiter.
2. [[shopScanCamera]] – das QR-Etikett des Artikels scannen.
3. [[shopBasket]] (Warenkorb)
</div>

1. Öffnen Sie [[shopTabSell]]. Scannen Sie das Etikett oder tippen Sie auf den Artikel und seine Größe.
2. Suchen Sie unter [[shopSoldTo]] das Mitglied oder wählen Sie [[shopWalkIn]].
3. Wählen Sie [[shopPayCash]], [[shopPayCard]], [[shopPayOther]] oder [[shopPayLater]].
4. Klicken Sie auf [[shopCompleteSale]].

Unbezahlte Verkäufe warten unter [[shopTabSales]], bis Sie auf [[shopMarkPaidCash]] oder [[shopMarkPaidCard]] klicken.

## Inventur {#shop-count}

Klicken Sie vor einer Inventur auf [[shopPrintCountSheet]] (Reiter [[shopTabItems]]) und dann auf [[shopTakeCountSheet]]. Haken Sie den Ausdruck am Schrank ab. [[shopPrintCatalogue]] druckt eine Preisliste für das Schwarze Brett.

# Kalender {#calendar}

<p class="roles"><span class="chip">Alle Rollen</span><span class="chip">Modul Veranstaltungskalender</span></p>

Den Kalender teilen sich die LTF und alle Vereine. Jeder Termin legt fest, wer ihn sehen darf.
{: .lead}

![Der Kalender](fig:calendar)

<div class="legend" markdown="1">
1. [[Events.calendarNew]] (neuer Termin)
2. [[Events.calendarPrevMonth]]
3. [[Events.calendarNextMonth]]
4. Im Menü zählt die Zahl die kommenden Termine; [[Events.calendarNavNew]] bedeutet, dass es Termine gibt, die Sie noch nicht geöffnet haben.
</div>

## Einen Termin anlegen {#new-event}

1. Klicken Sie auf [[Events.calendarNew]].
2. Geben Sie [[Events.calendarFieldTitle]], [[Events.calendarFieldStart]] und [[Events.calendarFieldEnd]] ein (oder haken Sie [[Events.calendarAllDay]] an), dazu [[Events.calendarFieldVenue]] und [[Events.calendarFieldAddress]].
3. Wählen Sie die [[Events.calendarFieldKind]]: [[Events.calendarKind_calendar]], [[Events.calendarKind_kyorugi]] oder [[Events.calendarKind_poomsae]].
4. Wählen Sie unter [[Events.calendarFieldVisibility]], wer den Termin sieht (Tabelle unten).
5. Klicken Sie auf [[Events.calendarSave]].

![Ein neuer Vereinstermin](fig:event-form)

<div class="legend" markdown="1">
1. [[Events.calendarFieldVisibility]] – die Beschreibung unter jeder Wahl sagt genau, wer den Termin sehen wird.
</div>

| Wahl | Vereinstermin: wer sieht ihn | LTF-Termin: wer sieht ihn |
|---|---|---|
| [[Events.calendarVisibility_public]] | Mitglieder, Admins und Trainer dieses Vereins sowie LTF Admin | alle Angemeldeten |
| [[Events.calendarVisibility_internal]] | Admins und Trainer dieses Vereins | LTF Admin, LTF Finance, Club-Admins und Trainer |
| [[Events.calendarVisibility_private]] | nur die Admins dieses Vereins | nur LTF Admins |
| [[Events.calendarVisibility_shared]] | die LTF und Admins und Trainer aller Vereine, dazu die Mitglieder dieses Vereins | die LTF und Admins und Trainer aller Vereine |
| [[Events.calendarVisibility_presidents]] | – | LTF Admins und der amtierende Präsident jedes unter [[Events.calendarAudienceClubs]] angehakten Vereins |

> [!NOTE]
> Die Beschreibungen auf dem Bildschirm nennen auch Mitglieder. Mitglieder haben heute keinen Login (siehe [Rollen](#roles)); in der Praxis sehen einen Termin also die genannten Mitarbeitenden.

> [!TIP]
> Sie planen ein Vereinsturnier? Wählen Sie [[Events.calendarVisibility_shared]], damit andere Vereine den Termin früh sehen und Überschneidungen vermeiden.

## Erinnerungen {#reminders}

Öffnen Sie einen Termin, wählen Sie unter [[Events.calendarReminderOn]] ein Datum und klicken Sie auf [[Events.calendarReminderSave]]. An diesem Tag erscheint eine Erinnerung, sobald Sie in der App sind. Klicken Sie auf [[Events.calendarReminderSnooze]] oder [[Events.calendarReminderGotIt]]. [[Events.calendarReminderClear]] löscht sie.

# Club-Admin: Vereinsprofil, Vorstand und Admins {#club-settings}

<p class="roles"><span class="chip">Club-Admin</span></p>

[[navSettings]] hat vier Reiter.

![Vereinsprofil](fig:club-profile)

<div class="legend" markdown="1">
1. [[clubSettingsProfileTab]] – Adresse, E-Mail, Website, IBAN, Sprache.
2. [[clubSettingsTrainersTab]] (Trainer)
3. [[clubSettingsCommitteeTab]] (Vorstand)
4. [[clubSettingsPublicationTab]] (Veröffentlichungseinwilligung)
</div>

## Profil {#profile-tab}

Halten Sie [[clubEmailLabel]], [[clubWebsiteLabel]], [[ibanLabel]] und [[clubLanguageLabel]] korrekt: Sie stehen auf den Rechnungen an Ihre Mitglieder, und die LTF schreibt Ihnen in dieser Sprache. Klicken Sie auf [[saveClub]].

## Trainer {#coaches-tab}

1. Öffnen Sie [[clubSettingsTrainersTab]].
2. Klicken Sie links auf ein Mitglied und dann rechts auf das Feld [[trainersDropColumn]].
3. Hat das Mitglied noch keine E-Mail-Adresse, geben Sie eine unter [[trainerEmailPlaceholder]] ein und klicken Sie auf [[trainerAdd]]. Der Trainer erhält eine Willkommens-E-Mail zum Festlegen des Passworts.
4. Haken Sie [[trainerQualite]] bei Trainern an, die in die Qualité+-Akte gehören.

![Trainer](fig:club-coaches)

> [!NOTE]
> Trainer müssen aktive, volljährige Mitglieder Ihres eigenen Vereins sein. [[trainerRemove]] entfernt die Trainerrolle; die Person bleibt Mitglied.

## Vorstand {#committee}

Der Vorstand bestimmt, wer Zahlungen erfassen darf, und sein Präsident erhält die Termine für Vereinspräsidenten.

1. Öffnen Sie [[clubSettingsCommitteeTab]]. Klicken Sie bei Bedarf auf [[createCommittee]].
2. Wählen Sie unter [[committeeOffices]] ein Amt, zum Beispiel President, geben Sie [[committeeStart]] ein und klicken Sie auf [[addMandate]].
3. Klicken Sie auf das Amt und dann auf das Mitglied, das es innehat.

![Der Vereinsvorstand](fig:committee)

> [!WARNING]
> Wechselt der Kassierer, aktualisieren Sie den Vorstand **vor** dem nächsten Zahlungslauf. Ohne aktuelles Amt kann im Verein niemand Zahlungen erfassen.

## Veröffentlichungseinwilligung {#consent}

[[clubSettingsPublicationTab]] zeigt ein Raster aus Mitgliedern und Kanälen (Website, Printmedien, Facebook, Instagram …). Jedes Häkchen wird sofort gespeichert. Bevor Sie Fotos veröffentlichen, haken Sie die Kanäle an und laden Sie [[publicationPdfList]] herunter – so erhalten Sie die Liste der Mitglieder, die nicht gezeigt werden dürfen.

## Club-Admins {#club-admins}

[[navClubAdmins]] legt fest, wer den Verein in der App führt.

1. Öffnen Sie [[navClubAdmins]]. Klicken Sie rechts auf Ihren Verein, um seine Mitglieder aufzulisten.
2. Klicken Sie auf ein Mitglied und dann wieder auf den Verein.
3. Hat das Mitglied noch keinen Login, geben Sie unter [[adminEmailTitle]] eine E-Mail-Adresse ein. Eine Willkommens-E-Mail mit einem Link zum Festlegen des Passworts wird verschickt.

![Club-Admins](fig:club-admins)

Unter [[adminsCurrentTitle]] entfernen Sie jemanden, der den Verein nicht mehr verwalten soll. [[adminsLicensedOnly]] beschränkt die Liste auf Mitglieder mit gültiger Lizenz.

# Das Vereinsjahr auf einen Blick {#club-year}

Eine Checkliste für vielbeschäftigte Ehrenamtliche. Jede Zeile verweist auf den passenden Abschnitt.
{: .lead}

| Wann | Aufgabe | Abschnitt |
|---|---|---|
| Sommer | Vorstand, Trainer, Vereinsprofil aktualisieren | [Vorstand](#committee) |
| Vor der Saison | Stundenplan, Ferien, Beförderungsregeln | [Stundenplan](#timetable) |
| September | Beiträge und Familienrabatte | [Mitgliedsbeiträge](#fees) |
| September | Lizenzen für alle Sportler bestellen | [Lizenzen bestellen](#order-licences) |
| September | LTF-Rechnung bezahlen | [Die LTF bezahlen](#pay-ltf) |
| Nach Zahlung | Lizenzkarten drucken | [Karten drucken](#print-cards) |
| Bis 30. September | Subventionsakte | [Subventionen](#subsidies) |
| Oktober | Mitgliedsbeiträge abrechnen | [Abrechnung](#billing) |
| Jede Einheit | Anwesenheit erfassen | [Anwesenheit](#roll) |
| Monatlich | Zahlungen erfassen, Kontoauszug importieren | [Bankabgleich](#bank) |
| Vor einer Prüfung | Gürtelprüfung | [Beförderung](#promotion) |
| Jahresende | Berichte für die Generalversammlung | [Berichte](#reports) |

# LTF Admin {#ltf-admin}

<p class="roles"><span class="chip">LTF Admin</span></p>

Das Verbandsmenü ([[Common.navGroupFederation]]) enthält [[LtfAdmin.navOverview]], [[LtfAdmin.navClubs]], [[LtfAdmin.navClubAdmins]], [[LtfAdmin.navMemberTransfers]], [[LtfAdmin.navMembers]], [[LtfAdmin.navLicenses]], [[LtfAdmin.navLicenseCards]], [[LtfAdmin.navLicenseCardPrintJobs]], [[LtfAdmin.navLicenseTypes]], [[LtfAdmin.navPrinterProfiles]] und [[LtfAdmin.navSettings]], dazu [[LtfAdmin.navCommittee]] und [[LtfAdmin.navCalendar]].

## Verbandsübersicht {#ltf-overview}

Die Übersicht zählt Vereine, Mitglieder und Lizenzen. Ihre Aufgabenliste zeigt Vereine ohne Admin, ausstehende Transfers mit Ablöse und Mitglieder, die auf eine Lizenz warten.

![Die LTF-Übersicht](fig:ltf-overview)

## Vereine und Club-Admins {#ltf-clubs}

[[LtfAdmin.navClubs]] listet alle Vereine. Öffnen Sie einen Verein, um seine Daten zu bearbeiten, seine Logos hochzuladen (für Rechnungen, Druck und Bildschirm) und seine Mitglieder zu sehen.

![Ein Verein aus Sicht der LTF](fig:ltf-club)

[[LtfAdmin.navClubAdmins]] funktioniert wie die Vereinsseite unter [Club-Admins](#club-admins), aber für alle Vereine.

## Mitglieder, Lizenzen und Transfers {#ltf-licences}

- [[LtfAdmin.navMembers]] und [[LtfAdmin.navLicenses]] zeigen alle Vereine gleichzeitig; mit der Vereinsauswahl grenzen Sie ein.
- [[LtfAdmin.navMemberTransfers]] listet die letzten Vereinswechsel, Transfers mit Ablöse und mögliche Vereinstouristen – Mitglieder, die ungewöhnlich oft den Verein gewechselt haben.

![Transfers aus Verbandssicht](fig:ltf-transfers)

## Lizenzkarten {#ltf-cards}

[[LtfAdmin.navLicenseCards]] enthält die Kartenvorlagen. Öffnen Sie eine Vorlage im Designer, um Foto, Name, Grad, Lizenznummer und QR-Code zu platzieren. Veröffentlichen Sie eine Version und legen Sie sie als Standard fest: Damit drucken die Club-Admins. [[LtfAdmin.navLicenseCardPrintJobs]] zeigt jeden Druckauftrag aller Vereine; [[LtfAdmin.navPrinterProfiles]] speichert den X/Y-Versatz bekannter Drucker.

![Der Karten-Designer](fig:designer)

## Verbandseinstellungen {#ltf-settings}

[[LtfAdmin.navSettings]] enthält Adresse und IBAN des Verbands, den [[clubTouristThresholdLabel]] und die Import-Option [[importPrefixRewriteLabel]].

![Verbandseinstellungen](fig:ltf-settings)

# LTF Finance {#ltf-finance}

<p class="roles"><span class="chip">LTF Finance</span></p>

Das Finanzmenü enthält [[LtfFinance.navOverview]], [[LtfFinance.navOrders]], [[LtfFinance.navInvoices]], [[LtfFinance.navPayments]], [[LtfFinance.navIncome]], [[LtfFinance.navExpenses]], [[LtfFinance.navBank]], [[LtfFinance.navReports]], [[LtfFinance.navAuditLog]] und [[LtfFinance.navLicenseSettings]].

![Die Finanzübersicht](fig:fin-overview)

## Lizenzpreise und Bestellfenster {#license-settings}

Unter [[LtfFinance.navLicenseSettings]] definiert der Reiter [[settingsTabLicenseTypes]] jeden Lizenztyp mit seinem [[currentYearWindowLabel]] und [[nextYearWindowLabel]]. [[settingsTabLicensePrices]] speichert Preise mit Verlauf: Ein neuer Preis gilt ab seinem Datum [[priceEffectiveFromLabel]].

![Lizenzeinstellungen](fig:fin-settings)

## Vereinsgebühren {#club-fees}

[[settingsTabClubFees]] listet, was die LTF den Vereinen berechnet (Mitgliedschaft im Verband, Versicherung …): [[clubFeeCadenceAnnual]], [[clubFeeCadencePerMember]], [[clubFeeCadencePerEvent]] oder [[clubFeeCadenceOneOff]]. Wählen Sie im Reiter [[settingsTabBilling]] das [[clubFeeBillingYearLabel]], die Gebühren und die Vereine und klicken Sie auf [[clubFeeBillingSubmitYear|year=2026]]. Ein Verein, der für dieses Jahr schon eine Rechnung hat, wird übersprungen – Sie können den Lauf also gefahrlos wiederholen. [[clubFeeBillingRecurringLabel]] wiederholt die Abrechnung monatlich oder jährlich.

![Vereinsgebühren abrechnen](fig:fin-billing)

## Rechnungen, Zahlungen und Gutschriften {#ltf-invoices}

1. Öffnen Sie [[LtfFinance.navInvoices]] und klicken Sie auf eine Rechnung.
2. Ist die Überweisung des Vereins eingegangen, klicken Sie auf [[recordPaymentButton]]. Bezahlte Lizenzen werden aktiv.
3. Um den offenen Betrag eines Vereins zu verringern, geben Sie [[creditNoteAmountLabel]] und [[creditNoteReasonLabel]] ein und klicken Sie auf [[addCreditNoteAction]].
4. Um eine offene Rechnung anzumahnen, klicken Sie auf [[sendReminderAction]]. [[lastRemindedAtLabel]] zeigt, wann Sie das zuletzt getan haben.

![Rechnungsdetails mit Gutschriften](fig:fin-invoice)

## Die Bücher des Verbands {#ltf-books}

[[LtfFinance.navIncome]], [[LtfFinance.navExpenses]], [[LtfFinance.navBank]] und [[LtfFinance.navReports]] funktionieren wie die Vereinsseiten unter [Club-Admin: Finanzen](#club-money), nur für die Konten des Verbands. [[LtfFinance.navAuditLog]] protokolliert, wer was geändert hat.

![Verbandsberichte](fig:fin-reports)

# Module (technischer Administrator) {#ops}

<p class="roles"><span class="chip">Superuser</span></p>

Der technische Administrator öffnet die [[Common.openOpsConsole]]. Unter Modules wird ein signierter Produktcode der LTF eingegeben und eingelöst, und jeder Verein erhält die Module, die er nutzen darf. Der Katalog nennt auch Module, die noch nicht ausgeliefert werden, etwa Verbandsinventar und Turniere; sie lassen sich nicht einschalten.

![Ops – Module](fig:ops-modules)

# Fragen und Fehlerbehebung {#faq}

### Ich kann mich nicht anmelden.
Prüfen Sie den Benutzernamen (das ist nicht immer Ihre E-Mail-Adresse) und das Passwort. Meldet die Seite, dass Ihre E-Mail nicht bestätigt ist, siehe [E-Mail-Adresse bestätigen](#verify-email). Passwort vergessen? Siehe [Passwort vergessen](#forgotten-password).

### Können sich Mitglieder oder Eltern anmelden?
Nein. Die App ist derzeit ein Verwaltungswerkzeug nur für die Mitarbeitenden der Vereine und des Verbands. Mitglieder und Eltern haben keinen Login; ihr Verein hält ihre Daten aktuell. Ein Zugang für Mitglieder kann später folgen.

### Ein hier beschriebener Menüpunkt fehlt.
Ihre Rolle oder die Module Ihres Vereins enthalten ihn nicht. Siehe [Rollen](#roles) und [Module](#modules).

### Ich sehe den falschen Verein.
Wählen Sie Ihren Verein oben auf der Seite in der Vereinsauswahl.

### Beim Erfassen einer Zahlung erscheint „Only the president, vice president, treasurer…“.
Sie haben kein aktuelles Vorstandsamt. Bitten Sie den Präsidenten, den [Vorstand](#committee) zu aktualisieren.

### Ein Haushalt ist bei der Abrechnung „Blocked“.
Lesen Sie den Grund in der Zeile. Meist braucht ein Kind einen Rechnungsempfänger (siehe [Familien](#families)) oder es ist kein Mitgliedsbeitrag festgelegt (siehe [Mitgliedsbeiträge](#fees)).

### Beim Bestellen kann ich keinen Lizenztyp wählen.
Der Grund steht neben dem Typ: Das Bestellfenster ist geschlossen, es gibt keinen Preis, oder die Mitglieder haben diese Lizenz schon. Fenster und Preise legt LTF Finance fest.

### Die gedruckte Karte ist verschoben.
Drucken Sie in 100 % und nutzen Sie ein Druckerprofil mit dem richtigen Versatz (siehe [Lizenzkarten drucken](#print-cards)).

### Datumsangaben erscheinen als mm/dd/yyyy.
Datumsfelder folgen den Spracheinstellungen Ihres Browsers. Stellen Sie den Browser auf Deutsch, Französisch, Luxemburgisch oder Englisch (Vereinigtes Königreich), um Tag/Monat/Jahr zu sehen.

### Die Anwesenheitsliste ist leer.
Fügen Sie bei einer neuen Einheit Schüler unter [[trainingAddStudents]] hinzu und speichern Sie. Für das nächste Mal tragen Sie sie als [[trainingRegulars]] im [[trainingTimetable]] ein.

### Im Kalendermenü steht eine Zahl.
Sie gibt an, wie viele kommende Termine Sie sehen können. Das Wort [[Events.calendarNavNew]] erscheint, wenn einige davon neu für Sie sind.

### Wo kann ich meine Datenschutzrechte ausüben?
Mit einem Login nutzen Sie die Seite aus [Datenschutz und Ihre Daten](#privacy). Mitglieder und Eltern wenden sich an ihren Verein oder an die LTF; diese können ihre Daten exportieren oder berichtigen.

### Können wir online bezahlen?
Noch nicht. Die Schaltfläche [[Common.payNow]] führt nur Testzahlungen aus. Bezahlen Sie LTF-Rechnungen per Überweisung (siehe [Die LTF bezahlen](#pay-ltf)).
