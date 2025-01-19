# MapScraper Pro

Ce projet est une application complète permettant de scraper et visualiser les données des restaurants en France.

## Technologies utilisées

### Backend (Scraper)

-   Node.js
-   Puppeteer
-   Worker Threads
-   File System (fs)

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

## Installation

1. Cloner le dépôt :

    ```bash
    git clone https://github.com/Zakaria-salmi/MapScraper-Pro.git
    ```

2. Installer les dépendances du backend :

    ```bash
    cd restaurant-scraper
    npm install
    ```

## Configuration

1. Configurer les catégories de restaurants dans le fichier `scraper.js` :
    ```javascript
    const categories = ["restaurant", "fast-food", "brasserie"];
    ```

## Utilisation

### Lancer le scraper :

```bash
node scraper.js
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


