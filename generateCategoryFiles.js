const fs = require("fs");

// Lecture du fichier source
const sourceFile = fs.readFileSync(
    "csvCateg/Art Thérapeutes en France.csv",
    "utf-8"
);
const lines = sourceFile.split("\n").filter((line) => line.trim());

// Extraction des coordonnées
const coordinates = lines
    .slice(1)
    .map((line) => {
        const match = line.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),/);
        if (match) {
            return {
                lat: match[1],
                lng: match[2],
            };
        }
        return null;
    })
    .filter((coord) => coord !== null);

// Catégories
const categories = ["restaurant", "fast-food", "brasserie"];

// Création des fichiers CSV pour chaque catégorie
categories.forEach((category) => {
    let csvContent = "url\n"; // En-tête

    coordinates.forEach((coord) => {
        const url = `"https://www.google.com/maps/search/${category}/@${coord.lat},${coord.lng},16z"`;
        csvContent += `${url}\n`;
    });

    // Écriture du fichier
    fs.writeFileSync(`csvCateg/${category}.csv`, csvContent);
    console.log(
        `📝 Fichier ${category}.csv créé avec ${coordinates.length} coordonnées`
    );
});
