# MapScraper Pro

Ce projet est une application complète permettant de scraper et visualiser les données des restaurants en France. Il combine un scraper Node.js pour la collecte des données et une interface utilisateur Vue.js pour leur visualisation.

## Technologies utilisées

### Backend (Scraper)

-   Node.js
-   Puppeteer
-   Worker Threads
-   File System (fs)

### Frontend (Viewer)

-   Vue.js 3
-   Tailwind CSS
-   @tailwindcss/forms

## Fonctionnalités

-   **Scraping intelligent** : Collecte automatisée des données de restaurants avec gestion des erreurs et reprise
-   **Multi-catégories** : Support pour différentes catégories (restaurant, fast-food, brasserie)
-   **Données détaillées** : Extraction des informations essentielles :
    -   Nom et type de restaurant
    -   Adresse et coordonnées GPS
    -   Note et nombre d'avis
    -   Photos (jusqu'à 7 par établissement)
    -   Horaires d'ouverture
    -   Tranche de prix
-   **Interface utilisateur** :
    -   Tableau de bord avec statistiques
    -   Filtrage et recherche
    -   Visualisation détaillée des restaurants
    -   Galerie photos
    -   Design responsive

## Installation

1. Cloner le dépôt :

    ```bash
    git clone https://github.com/votre-username/restaurant-scraper.git
    ```

2. Installer les dépendances du backend :

    ```bash
    cd restaurant-scraper
    npm install
    ```

3. Installer les dépendances du frontend :
    ```bash
    cd frontend
    npm install
    ```

## Configuration

1. Créer un fichier de configuration Tailwind :

    ```bash
    npx tailwindcss init
    ```

2. Configurer les catégories de restaurants dans le fichier `scraper.js` :
    ```javascript
    const categories = ["restaurant", "fast-food", "brasserie"];
    ```

## Utilisation

### Lancer le scraper :

```bash
node scraper.js
```

### Démarrer l'interface utilisateur :

```bash
cd frontend
npm run dev
```

## Structure des données

Les données scrapées sont sauvegardées dans plusieurs fichiers JSON :

-   `results-{category}.json` : Résultats par catégorie
-   `results-france.json` : Récapitulatif global
-   `progress-{category}.json` : Fichiers de progression

## Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :

1. Fork le projet
2. Créer une branche pour votre fonctionnalité
3. Commiter vos changements
4. Pousser vers la branche
5. Ouvrir une Pull Request

## Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.
