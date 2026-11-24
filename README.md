# Pr8note

> Ton espace scolaire, en mieux.

**Pr8note** est un client scolaire indépendant, moderne et fluide. Il réunit l'emploi du temps, les notes, les devoirs, la vie scolaire, la messagerie et les ressources dans une interface claire — puis s'exporte en application macOS native ou se consulte directement sur le web.

![Statut](https://img.shields.io/badge/version-1.0.0-8b7bff)
![Plateforme](https://img.shields.io/badge/macOS-12%2B-black)
![Web](https://img.shields.io/badge/web-PWA-22d3ee)

---

## ✨ Fonctionnalités

- **Splash screen animé** et arrivée dans l'app en douceur.
- **Tableau de bord vivant** : prochain cours avec compte à rebours, devoirs, dernières notes, actualités et charge de travail.
- **Emploi du temps hebdomadaire** : navigation semaine par semaine, cours en cours, salles modifiées, annulations et fiche détaillée d'un cours.
- **Notes & bulletin interactif** : moyennes pondérées, comparaison avec la classe, évolution, détail par matière et **simulateur de moyenne**.
- **Devoirs** : filtres par matière, groupes intelligents (en retard, aujourd'hui, demain…), cases à cocher persistantes et estimation du temps de travail.
- **Vie scolaire** : timeline des absences, retards et sanctions, assiduité et action « justifier ».
- **Messagerie** : conversations, messages non lus, favoris, réponses et envoi de messages (conservés localement).
- **Ressources** : bibliothèque filtrable, favoris et fiches détaillées.
- **Recherche universelle ⌘K** : pages, actions, devoirs, messages, matières et ressources.
- **Personnalisation** : thème sombre/clair, cinq accents, densité compacte, réduction des animations.
- **Données locales** : export / import JSON, réinitialisation de la démo.
- **PWA** : installation sur l'écran d'accueil et cache hors ligne.
- **Application macOS `.app`** : coque native WKWebView ultra-légère, icône générée, menus natifs.

## 🖥️ Accès web

La version compilée est publiée dans le dépôt [`Pr8note_web`](https://github.com/petipotam17/Pr8note_web) et servie par GitHub Pages :

**https://petipotam17.github.io/Pr8note_web/**

## 🚀 Démarrage

```bash
npm install
npm run dev
```

Puis ouvre http://127.0.0.1:5173.

### Compiler pour le web

```bash
npm run build
```

Le résultat statique se trouve dans `dist/`.

### Créer l'application macOS (.app)

Prérequis : macOS avec les Command Line Tools (`xcode-select --install`).

```bash
npm run app:mac
```

Cette commande :

1. compile l'interface avec Vite ;
2. compile la coque native Swift (`macos/main.swift`) ;
3. génère l'icône (`macos/IconGen.swift`) ;
4. produit `build/Pr8note.app`, prêt à être lancé ou déplacé dans `/Applications`.

```bash
open build/Pr8note.app
```

## 🗂️ Structure

```
src/
  components/     layout, splash, palette, UI partagée
  data/seed.ts    données de démonstration (français, réalistes)
  lib/            store persistant, analytics, dates, thème
  pages/          dashboard, emploi du temps, notes, devoirs, vie scolaire, messages…
macos/
  main.swift      coque macOS WKWebView
  IconGen.swift   génération de l'icône 1024 px
scripts/
  build-macos-app.sh
public/           favicon, manifest PWA, service worker
```

## 🔐 À propos des données

Cette première version fonctionne avec un **espace de démonstration complet** : données fictives, aucune connexion à un serveur PRONOTE. PRONOTE est un logiciel propriétaire d'Index Éducation ; toute synchronisation réelle nécessitera l'autorisation et le connecteur de l'établissement.

Les devoirs cochés, messages lus, réponses, favoris et réglages sont stockés dans le navigateur (localStorage). L'export JSON permet de les sauvegarder et de les réimporter.

## ⚠️ Indépendance

Pr8note n'est ni affilié à Index Éducation, ni à PRONOTE. Les marques citées appartiennent à leurs propriétaires respectifs.

---

Fait avec soin pour les élèves.
