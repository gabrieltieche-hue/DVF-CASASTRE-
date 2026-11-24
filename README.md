# DVF Cadastre

Extraction et analyse des transactions DVF (Demandes de Valeurs Foncieres) par rayon geographique, typologie et surface.

## Fonctionnalites

- Recherche par adresse et rayon.
- Filtres par typologie, surface et prix.
- Carte Leaflet et fond Google Maps.
- Tableau, comparaison, fiche detaillee et enrichissement des biens.

## Stack

React, Vite, TypeScript, Express, Leaflet, `@vis.gl/react-google-maps`, `@google/genai`.

## Demarrage

```bash
npm install
cp .env.example .env
# renseigner les cles Google Maps et Gemini
npm run dev
```

Scripts : `dev`, `build`, `start`, `preview`, `lint`.

## Notes

`.gmp_cache/` est un cache de documentation Google Maps genere automatiquement. Il ne devrait pas etre versionne.
