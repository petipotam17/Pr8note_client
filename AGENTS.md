# Pr8note — consignes de travail

- Après chaque modification : `node --test worker/*.test.mjs` puis `npm run build`.
- Toute modification est commitée et poussée sur `petipotam17/Pr8note_client` (`main`), sans attendre qu'on me le demande.
- Toute modification du Worker est redéployée en production (site `15927b2a-74f0-46ff-a3c8-904317f483b1`, manifeste `worker/deploy.json`) et vérifiée via `/health`.
- Toute modification du client est republiée sur `petipotam17/Pr8note_web` (contenu de `dist/` à la racine) pour GitHub Pages.
