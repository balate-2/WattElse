# WattElse — Le vide-poche électrique

Application web et PWA construite avec **Next.js**, **Tailwind CSS** et **Supabase** (partageant la même base de données que GourmetLab via le préfixe `we_`).

## Installation rapide

1. **Base de données Supabase :**
   - Ouvre le SQL Editor de ton projet Supabase existant.
   - Exécute le contenu du fichier `supabase/schema.sql`.
   - Dans **Authentication > URL Configuration**, ajoute ton URL locale (`http://localhost:3000`) et ton URL Vercel dans les **Redirect URLs**.

2. **Configuration locale :**
   - Renomme `.env.local.example` en `.env.local` et renseigne tes clés Supabase.
   - Installe les dépendances :
     ```bash
     npm install
     ```
   - Lance le serveur de développement :
     ```bash
     npm run dev
     ```
