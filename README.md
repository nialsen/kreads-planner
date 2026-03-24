# Kreads Production Planner

Outil de répartition et priorisation des concepts créatifs pour l'équipe de montage Kreads.

## Stack
- **Frontend** : React + Vite
- **Backend** : Supabase (PostgreSQL + Realtime)
- **Hébergement** : Vercel (gratuit)

---

## 🚀 Déploiement pas à pas (30-45 min)

### Étape 1 — Créer un compte Supabase

1. Va sur [supabase.com](https://supabase.com) et crée un compte (connexion via GitHub recommandée)
2. Clique **"New Project"**
3. Remplis :
   - **Name** : `kreads-planner`
   - **Database Password** : choisis un mot de passe fort (note-le quelque part)
   - **Region** : `West EU (Ireland)`
4. Clique **"Create new project"** et attends ~2 min

### Étape 2 — Créer les tables

1. Dans ton projet Supabase, va dans **SQL Editor** (icône `<>` dans le menu de gauche)
2. Clique **"New query"**
3. Ouvre le fichier `supabase-schema.sql` de ce repo, copie **tout** le contenu
4. Colle-le dans l'éditeur SQL
5. Clique **"Run"** (le bouton vert)
6. Tu devrais voir "Success. No rows returned" → c'est normal, les tables sont créées

**Vérification** : va dans **Table Editor** (menu de gauche), tu dois voir 5 tables : `editors`, `clients`, `affinities`, `weekly_editor_availability`, `weekly_client_demands`.

### Étape 3 — Activer le Realtime

Pour que tous les utilisateurs voient les changements en temps réel :

1. Va dans **Database** → **Replication** (ou cherche "Replication" dans le menu)
2. Sous "Realtime", active les tables suivantes en cliquant le toggle :
   - `editors`
   - `clients`
   - `affinities`
   - `weekly_editor_availability`
   - `weekly_client_demands`

### Étape 4 — Récupérer tes clés API

1. Va dans **Settings** → **API** (dans le menu de gauche)
2. Copie ces deux valeurs :
   - **Project URL** : ça ressemble à `https://xxxxx.supabase.co`
   - **anon public** (sous "Project API keys") : c'est une longue clé qui commence par `eyJ...`

### Étape 5 — Préparer le code

1. Si tu n'as pas Git, installe-le : [git-scm.com](https://git-scm.com)
2. Va sur [github.com](https://github.com), crée un compte si pas déjà fait
3. Crée un **nouveau repository** : `kreads-planner` (public ou privé)
4. Clone ce repo sur ton PC et copie tous les fichiers du projet dedans
5. Crée un fichier `.env` à la racine (copie `.env.example`) :
   ```
   VITE_SUPABASE_URL=https://ton-projet.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...ta-clé-ici
   ```
6. Push le tout sur GitHub :
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

### Étape 6 — Déployer sur Vercel

1. Va sur [vercel.com](https://vercel.com) et crée un compte (connexion via GitHub)
2. Clique **"Add New..."** → **"Project"**
3. Sélectionne ton repo `kreads-planner`
4. **IMPORTANT** — Dans **"Environment Variables"**, ajoute :
   - `VITE_SUPABASE_URL` → colle ton Project URL
   - `VITE_SUPABASE_ANON_KEY` → colle ta clé anon
5. Clique **"Deploy"**
6. Attends ~1 min, ton app est live ! 🎉

Vercel te donne une URL du type `kreads-planner.vercel.app`.

### Étape 7 — Partager à l'équipe

Envoie le lien Vercel à Loïs et aux Creative Strategists. C'est tout.

---

## 📋 Comment ça marche

### Onglet Référentiel
Données fixes : liste des clients (nom, pack, CS attitré) et des monteurs (nom, niveau, freelance). À remplir une seule fois.

### Onglet Affinités
Matrice monteur × client. Coche quel monteur connaît quel client. C'est une contrainte forte dans l'algo d'assignation.

### Onglet Semaine
Données variables : dispos des monteurs (jours/semaine), demandes clients (concepts, flags, arrivée des rushs). Navigable par semaine avec les flèches.

### Onglet Planning
Résultat auto-calculé : priorisation des clients par score, assignation des monteurs en respectant les affinités, séquençage par date d'arrivée des rushs.

---

## 🔧 Développement local

```bash
npm install
npm run dev
```

L'app tourne sur `http://localhost:5173`.

---

## 📂 Structure

```
kreads-planner/
├── index.html
├── package.json
├── vite.config.js
├── supabase-schema.sql    ← À copier-coller dans Supabase SQL Editor
├── .env.example           ← Template des variables d'environnement
├── .env                   ← Tes vraies clés (ne pas commiter)
└── src/
    ├── main.jsx
    ├── App.jsx             ← Toute la logique de l'app
    └── lib/
        └── supabase.js     ← Client Supabase
```
