# Julelotteri med flere PC-er

## Installasjon fra GitHub
- Last ned install.bat fra repoet og dobbeltklikk den. Den installerer/oppdaterer i Dokumenter\Julemessetrekning
  og lager snarvei på skrivebordet. Kjør den igjen for å oppdatere (data-mappen røres ikke).

## Slik starter du
1. Installer Node.js én gang på PC-en som skal være "trekke-PC" (https://nodejs.org, velg LTS).
2. Dobbeltklikk start.bat. Et svart vindu åpnes (la det stå åpent), og nettleseren åpner trekningssiden.
3. Første gang spør Windows om brannmuren. Velg "Tillat" for private nettverk,
   ellers får ikke de andre PC-ene kontakt.

## Slik bruker de andre PC-ene det
- De må være på samme nettverk (samme ruter/wifi) som trekke-PC-en.
- I svart vindu står det adresser som "http://192.168.1.23:3000/registrer".
  Skriv den adressen i nettleseren på den andre PC-en.
  Samme adresser står også i Innstillinger på trekningssiden.
- Der velger man bok og skriver navn (og evt. telefon og adresse). Alt lagres med en gang
  og vises på trekke-PC-en og de andre PC-ene.

## Bilder fra mobil
- Trykk «QR til mobil» nederst på trekningssiden (eller se Innstillinger). Skann QR-koden med mobilen (samme wifi).
  Står det en forklaring i stedet for en kode, er siden ikke åpnet via http://localhost:3000.
- På mobilen velger man bok (valgfritt), tar bilde av arket og sender. Mobilens egen
  tekstgjenkjenning kan brukes til å kopiere tekst og lime den inn sammen med bildet.
- På registreringssiden (/registrer) åpner du "Bilder" øverst til høyre. Bildet vises ved siden av
  tabellen, med zoom og rotering, og boka velges automatisk. Skriv inn navnene og trykk "Ferdig".
- Ingen AI leser bildene. Et menneske kontrollerer og skriver inn.
- Bildene ligger i data\foto. Bruk "Slett" når de er ferdige (personopplysninger).
- Hvis QR-koden peker på feil adresse (flere nettverkskort), velg riktig adresse i listen ved siden av.

## Hvor ligger dataene?
- Mappen "data" ved siden av programmet:
    delt.json         navnelisten og innstillinger (leses inn igjen når programmet startes på nytt)
    state.json        alt fra trekningssiden (trekninger, gevinster ++)
    trekninger.csv    trekninger, åpnes i Excel (oppdateres automatisk)
    backup\           kopier hvert 10. minutt (de siste 40 beholdes)
- Telefon og adresse ligger her som vanlig tekst. Slett eller sikre mappen etter messen.

## Viktig
- Alle på nettverket kan åpne adressen. Bruk et eget/lukket nettverk, ikke åpent gjestenett.
- Lukk det svarte vinduet for å stoppe. Ikke trykk på "x" midt i en trekning.
- Åpner du trekningssiden som en vanlig fil (uten server) virker alt som før, men uten deling.

## Annen port
- Hvis 3000 er opptatt: åpne cmd i denne mappen og skriv  node server.js 3001


QR-koden lages med biblioteket qrcode-generator (MIT-lisens), filen qr.js.
