const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
puppeteer.use(StealthPlugin());

const cities = ["le-mans", "paris", "lyon", "marseille", "bordeaux"];

const categories = [
    "restaurant",
    "fast-food",
    "pizzeria",
    "restaurant+traditionnel",
    "restaurant+gastronomique",
    "brasserie",
    "restaurant+japonais",
    "restaurant+chinois",
    "restaurant+italien",
];

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

    // Scroll jusqu'au bas
    let previousHeight = 0;
    let currentHeight = await page.evaluate(
        () => document.querySelector('div[role="feed"]').scrollHeight
    );

    while (previousHeight !== currentHeight) {
        previousHeight = currentHeight;

        await page.evaluate(() => {
            const feed = document.querySelector('div[role="feed"]');
            feed.scrollTo(0, feed.scrollHeight);
        });

        await new Promise((resolve) => setTimeout(resolve, 2000));

        currentHeight = await page.evaluate(
            () => document.querySelector('div[role="feed"]').scrollHeight
        );
    }

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
