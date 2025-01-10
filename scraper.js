const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
puppeteer.use(StealthPlugin());

const cities = ["le-mans", "paris", "lyon", "marseille", "bordeaux"];

const categories = ["restaurant", "fast-food"];

function getExistingUrls(city) {
    const filename = `restaurants-${city}.json`;
    if (fs.existsSync(filename)) {
        const data = JSON.parse(fs.readFileSync(filename, "utf8"));
        return new Set(data.restaurants);
    }
    return new Set();
}

async function scrapeRestaurantCategory(page, city, category) {
    console.log(`Scraping ${category} à ${city}...`);

    await page.goto(`https://www.google.com/maps/search/${category}+${city}`);

    // Gérer les cookies si nécessaire (première visite uniquement)
    try {
        const cookieButton = await page.waitForSelector(
            'button[aria-label="Tout accepter"]',
            {
                timeout: 5000,
            }
        );
        if (cookieButton) {
            await cookieButton.click();
        }
    } catch (error) {
        // Ignorer si pas de popup cookies
    }

    // Attendre que la liste des résultats soit chargée
    await page.waitForSelector('div[role="feed"]');

    // Fonction modifiée pour le scroll avec gestion du blocage
    async function scrollAndCheckEnd() {
        let isEndReached = false;
        let sameHeightCount = 0; // Compteur pour détecter un blocage potentiel

        while (!isEndReached) {
            const previousHeight = await page.evaluate(
                () => document.querySelector('div[role="feed"]').scrollHeight
            );

            // Scroll
            await page.evaluate(() => {
                const feed = document.querySelector('div[role="feed"]');
                feed.scrollTo(0, feed.scrollHeight);
            });

            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Vérifier si on est à la fin avec le sélecteur correct
            try {
                const endMessage = await page.$eval(
                    "#QA0Szd > div > div > div.w6VYqd > div:nth-child(2) > div > div.e07Vkf.kA9KIf > div > div > div.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde.ecceSd > div.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde.ecceSd.QjC7t > div.m6QErb.XiKgde.tLjsW.eKbjU > div > p > span > span",
                    (el) => el.textContent
                );

                if (
                    endMessage.includes("Vous êtes arrivé à la fin de la liste")
                ) {
                    console.log("Fin de la liste atteinte");
                    isEndReached = true;
                    break;
                }
            } catch (error) {
                // Le message de fin n'est pas encore visible
            }

            const currentHeight = await page.evaluate(
                () => document.querySelector('div[role="feed"]').scrollHeight
            );

            // Détecter un blocage potentiel
            if (currentHeight === previousHeight) {
                sameHeightCount++;

                if (sameHeightCount >= 3) {
                    // Après 3 tentatives sans changement
                    console.log("Blocage détecté, tentative de déblocage...");

                    // Cliquer sur le dernier élément visible
                    await page.evaluate(() => {
                        const elements =
                            document.getElementsByClassName("hfpxzc");
                        if (elements.length > 0) {
                            elements[elements.length - 1].click();
                        }
                    });

                    // Attendre et revenir en arrière
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    await page.goBack();
                    await new Promise((resolve) => setTimeout(resolve, 2000));

                    sameHeightCount = 0; // Réinitialiser le compteur
                }
            } else {
                sameHeightCount = 0; // Réinitialiser si la hauteur change
            }
        }
    }

    // Exécuter le nouveau scroll
    await scrollAndCheckEnd();

    // Récupérer les URLs
    const urls = await page.evaluate(() => {
        const elements = document.getElementsByClassName("hfpxzc");
        return Array.from(elements).map((element) =>
            element.getAttribute("href")
        );
    });

    return urls;
}

async function scrapeRestaurants(city) {
    console.log(`Début du scraping pour ${city}...`);

    const existingUrls = getExistingUrls(city);
    console.log(
        `${existingUrls.size} restaurants déjà enregistrés pour ${city}`
    );

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
    });

    const page = await browser.newPage();
    let allUrls = new Set(existingUrls);

    // Scraper chaque catégorie
    for (const category of categories) {
        try {
            const categoryUrls = await scrapeRestaurantCategory(
                page,
                city,
                category
            );
            categoryUrls.forEach((url) => allUrls.add(url));
            console.log(
                `${category}: ${categoryUrls.length} résultats trouvés`
            );

            // Pause entre chaque catégorie
            if (category !== categories[categories.length - 1]) {
                console.log(
                    "Pause de 10 secondes avant la prochaine catégorie..."
                );
                await new Promise((resolve) => setTimeout(resolve, 10000));
            }
        } catch (error) {
            console.error(
                `Erreur lors du scraping de ${category} à ${city}:`,
                error
            );
        }
    }

    await browser.close();

    const data = {
        city: city,
        total: allUrls.size,
        lastUpdate: new Date().toISOString(),
        restaurants: Array.from(allUrls),
    };

    // Sauvegarder les données
    try {
        fs.writeFileSync(
            `restaurants-${city}.json`,
            JSON.stringify(data, null, 2),
            "utf8"
        );
        console.log(
            `Données sauvegardées pour ${city}: ${allUrls.size} restaurants uniques au total`
        );
    } catch (error) {
        console.error(`Erreur lors de la sauvegarde pour ${city}:`, error);
    }

    return data;
}

async function scrapeAllCities() {
    for (const city of cities) {
        try {
            await scrapeRestaurants(city);
            // Pause entre chaque ville
            if (city !== cities[cities.length - 1]) {
                console.log("Pause de 30 secondes avant la prochaine ville...");
                await new Promise((resolve) => setTimeout(resolve, 30000));
            }
        } catch (error) {
            console.error(`Erreur lors du scraping de ${city}:`, error);
        }
    }

    // Créer le récapitulatif
    const summary = {
        lastUpdate: new Date().toISOString(),
        cities: cities
            .map((city) => {
                if (fs.existsSync(`restaurants-${city}.json`)) {
                    return JSON.parse(
                        fs.readFileSync(`restaurants-${city}.json`, "utf8")
                    );
                }
                return null;
            })
            .filter((data) => data !== null),
    };

    fs.writeFileSync(
        "restaurants-france.json",
        JSON.stringify(summary, null, 2),
        "utf8"
    );
    console.log("Récapitulatif global sauvegardé dans restaurants-france.json");
}

scrapeAllCities().catch(console.error);
