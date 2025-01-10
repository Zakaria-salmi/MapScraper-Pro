const {
    Worker,
    isMainThread,
    parentPort,
    workerData,
} = require("worker_threads");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
const path = require("path");
puppeteer.use(StealthPlugin());

// Configuration
const CONCURRENT_WORKERS = 2;

const cities = ["le-mans", "paris", "lyon", "marseille", "bordeaux"];

const categories = ["restaurant", "fast-food", "brasserie"];

// Code pour le worker thread
if (!isMainThread) {
    const { city } = workerData;

    async function extractGpsFromUrl(url) {
        try {
            const match = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
            if (match) {
                return {
                    latitude: parseFloat(match[1]),
                    longitude: parseFloat(match[2]),
                };
            }
        } catch (error) {
            console.error(
                "Erreur lors de l'extraction des coordonnées GPS:",
                error
            );
        }
        return null;
    }

    async function scrapeRestaurantCategory(page, city, category) {
        console.log(`Scraping ${category} à ${city}...`);

        await page.goto(
            `https://www.google.com/maps/search/${category}+${city}`
        );

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

        await page.waitForSelector('div[role="feed"]');

        let isEndReached = false;
        let sameHeightCount = 0;

        while (!isEndReached) {
            const previousHeight = await page.evaluate(
                () => document.querySelector('div[role="feed"]').scrollHeight
            );

            await page.evaluate(() => {
                const feed = document.querySelector('div[role="feed"]');
                feed.scrollTo(0, feed.scrollHeight);
            });

            await new Promise((resolve) => setTimeout(resolve, 2000));

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

            if (currentHeight === previousHeight) {
                sameHeightCount++;
                if (sameHeightCount >= 3) {
                    console.log("Blocage détecté, tentative de déblocage...");
                    await page.evaluate(() => {
                        const elements =
                            document.getElementsByClassName("hfpxzc");
                        if (elements.length > 0) {
                            elements[elements.length - 1].click();
                        }
                    });
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    await page.goBack();
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    sameHeightCount = 0;
                }
            } else {
                sameHeightCount = 0;
            }
        }

        const results = await page.evaluate(() => {
            const elements = document.getElementsByClassName("hfpxzc");
            return Array.from(elements).map((element) => ({
                url: element.getAttribute("href"),
                name: element.getAttribute("aria-label") || "",
            }));
        });

        const restaurantsWithData = await Promise.all(
            results.map(async (restaurant) => ({
                name: restaurant.name,
                url: restaurant.url,
                coordinates: await extractGpsFromUrl(restaurant.url),
            }))
        );

        return restaurantsWithData;
    }

    async function scrapeRestaurants(city) {
        console.log(`Début du scraping pour ${city}...`);

        const browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: ["--start-maximized", "--window-size=1920,1080"],
        });

        const page = await browser.newPage();
        await page.setViewport({
            width: 1920,
            height: 1080,
        });

        let allRestaurants = [];

        for (const category of categories) {
            try {
                const categoryResults = await scrapeRestaurantCategory(
                    page,
                    city,
                    category
                );
                allRestaurants = [...allRestaurants, ...categoryResults];

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
            total: allRestaurants.length,
            lastUpdate: new Date().toISOString(),
            restaurants: allRestaurants,
        };

        fs.writeFileSync(
            `restaurants-${city}.json`,
            JSON.stringify(data, null, 2),
            "utf8"
        );

        return data;
    }

    async function scrapeCity() {
        try {
            const result = await scrapeRestaurants(city);
            parentPort.postMessage({ success: true, city });
        } catch (error) {
            parentPort.postMessage({
                success: false,
                city,
                error: error.message,
            });
        }
    }

    scrapeCity();
}
// Code principal
else {
    async function main() {
        const chunks = [];

        // Diviser les villes en groupes
        for (let i = 0; i < cities.length; i += CONCURRENT_WORKERS) {
            chunks.push(cities.slice(i, i + CONCURRENT_WORKERS));
        }

        // Traiter chaque groupe de villes en parallèle
        for (const chunk of chunks) {
            console.log(`Traitement du groupe de villes: ${chunk.join(", ")}`);

            const workers = chunk.map((city) => ({
                city,
                worker: new Worker(__filename, {
                    workerData: { city },
                }),
            }));

            // Attendre que tous les workers du groupe terminent
            await Promise.all(
                workers.map(({ city, worker }) => {
                    return new Promise((resolve, reject) => {
                        worker.on("message", (message) => {
                            if (message.success) {
                                console.log(`✅ ${city} terminé`);
                            } else {
                                console.error(
                                    `❌ Erreur pour ${city}:`,
                                    message.error
                                );
                            }
                            resolve();
                        });
                        worker.on("error", reject);
                        worker.on("exit", (code) => {
                            if (code !== 0) {
                                reject(
                                    new Error(
                                        `Worker stopped with exit code ${code}`
                                    )
                                );
                            }
                        });
                    });
                })
            );

            // Pause entre les groupes
            if (chunks.indexOf(chunk) < chunks.length - 1) {
                console.log("Pause de 30 secondes avant le prochain groupe...");
                await new Promise((resolve) => setTimeout(resolve, 30000));
            }
        }

        // Créer le fichier récapitulatif final
        createSummaryFile();
    }

    main().catch(console.error);
}

function createSummaryFile() {
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
    console.log(
        "📝 Récapitulatif global sauvegardé dans restaurants-france.json"
    );
}
