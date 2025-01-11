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
const CONCURRENT_WORKERS = 1;
const categories = ["restaurant", "fast-food", "brasserie"];

// Fonction pour lire les URLs depuis un fichier CSV
function readUrlsFromCsv(category) {
    const csvContent = fs.readFileSync(`csvCateg/${category}.csv`, "utf-8");
    return csvContent
        .split("\n")
        .slice(1) // Ignorer l'en-tête
        .filter((line) => line.trim())
        .map((line) => line.replace(/"/g, "").trim());
}

// Ajout des fonctions de gestion de l'état
function saveProgress(category, lastIndex) {
    const progressFile = `progress-${category}.json`;
    fs.writeFileSync(
        progressFile,
        JSON.stringify({ lastIndex, timestamp: new Date().toISOString() })
    );
    console.log(
        `💾 Progression sauvegardée pour ${category}: ligne ${lastIndex}`
    );
}

function getLastProgress(category) {
    const progressFile = `progress-${category}.json`;
    try {
        if (fs.existsSync(progressFile)) {
            const progress = JSON.parse(fs.readFileSync(progressFile));
            console.log(
                `📖 Reprise du scraping pour ${category} à partir de la ligne ${progress.lastIndex}`
            );
            return progress.lastIndex;
        }
    } catch (error) {
        console.error(
            `Erreur lors de la lecture de la progression pour ${category}:`,
            error
        );
    }
    return 0;
}

// Ajout du compteur global
function getGlobalCounter() {
    try {
        if (fs.existsSync("global-counter.json")) {
            return JSON.parse(fs.readFileSync("global-counter.json")).counter;
        }
    } catch (error) {
        console.error("Erreur lors de la lecture du compteur global:", error);
    }
    return 0;
}

function saveGlobalCounter(counter) {
    fs.writeFileSync(
        "global-counter.json",
        JSON.stringify({ counter, lastUpdate: new Date().toISOString() })
    );
}

function saveResults(category, results, coords) {
    const resultsFile = `results-${category}.json`;
    let existingResults = [];
    let globalCounter = getGlobalCounter();

    try {
        if (fs.existsSync(resultsFile)) {
            existingResults = JSON.parse(fs.readFileSync(resultsFile)).results;
        }
    } catch (error) {
        console.error(
            `Erreur lors de la lecture des résultats existants pour ${category}:`,
            error
        );
    }

    // Ajouter les IDs aux nouveaux résultats
    const resultsWithIds = results.map((result) => {
        globalCounter++;
        return {
            ...result,
            id: globalCounter,
        };
    });

    // Ajouter les nouveaux résultats
    existingResults.push({
        coordinates: coords,
        data: resultsWithIds,
        timestamp: new Date().toISOString(),
    });

    // Sauvegarder le fichier mis à jour
    fs.writeFileSync(
        resultsFile,
        JSON.stringify(
            {
                category,
                results: existingResults,
                lastUpdate: new Date().toISOString(),
            },
            null,
            2
        )
    );

    // Sauvegarder le nouveau compteur global
    saveGlobalCounter(globalCounter);

    console.log(
        `💾 Résultats sauvegardés pour ${category} aux coordonnées ${coords.latitude},${coords.longitude}`
    );
    console.log(`📊 Nombre total de restaurants scrapés: ${globalCounter}`);
}

if (!isMainThread) {
    const { url, category } = workerData;

    async function extractGpsFromUrl(url) {
        try {
            const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
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

    async function scrapeLocation(page, url, category) {
        console.log(`Scraping ${category} à ${url}...`);

        await page.goto(url);

        try {
            const cookieButton = await page.waitForSelector(
                'button[aria-label="Tout accepter"]',
                { timeout: 5000 }
            );
            if (cookieButton) await cookieButton.click();
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

        console.log(
            `📊 Nombre de résultats pour ${category}: ${results.length}`
        );

        const coords = await extractGpsFromUrl(url);
        return {
            coordinates: coords,
            results: results,
            total: results.length,
        };
    }

    async function processUrl() {
        const browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null,
            args: ["--start-maximized", "--window-size=1920,1080"],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        try {
            const results = await scrapeLocation(page, url, category);
            await browser.close();
            parentPort.postMessage({ success: true, results, url, category });
        } catch (error) {
            await browser.close();
            parentPort.postMessage({
                success: false,
                url,
                category,
                error: error.message,
            });
        }
    }

    processUrl();
} else {
    async function processCategory(category) {
        const urls = readUrlsFromCsv(category);
        const startIndex = getLastProgress(category);

        for (let i = startIndex; i < urls.length; i += CONCURRENT_WORKERS) {
            const chunk = urls.slice(i, i + CONCURRENT_WORKERS);
            console.log(
                `Traitement de ${chunk.length} URLs pour ${category} (${
                    i + 1
                }/${urls.length})`
            );

            const workers = chunk.map((url) => ({
                url,
                worker: new Worker(__filename, {
                    workerData: { url, category },
                }),
            }));

            try {
                const chunkResults = await Promise.all(
                    workers.map(({ url, worker }) => {
                        return new Promise((resolve, reject) => {
                            worker.on("message", resolve);
                            worker.on("error", reject);
                            worker.on("exit", (code) => {
                                if (code !== 0)
                                    reject(
                                        new Error(
                                            `Worker stopped with exit code ${code}`
                                        )
                                    );
                            });
                        });
                    })
                );

                // Traiter et sauvegarder chaque résultat individuellement
                for (const result of chunkResults) {
                    if (result.success) {
                        saveResults(
                            category,
                            result.results.results,
                            result.results.coordinates
                        );
                    }
                }

                // Sauvegarder la progression
                saveProgress(category, i + CONCURRENT_WORKERS);

                if (i + CONCURRENT_WORKERS < urls.length) {
                    console.log(
                        "Pause de 30 secondes avant le prochain groupe..."
                    );
                    await new Promise((resolve) => setTimeout(resolve, 30000));
                }
            } catch (error) {
                console.error(
                    `Erreur lors du traitement du chunk pour ${category}:`,
                    error
                );
                // Sauvegarder la progression même en cas d'erreur
                saveProgress(category, i);
                throw error; // Propager l'erreur pour arrêter le processus
            }
        }

        console.log(`✅ Catégorie ${category} terminée`);
    }

    async function main() {
        for (const category of categories) {
            console.log(`🚀 Démarrage du scraping pour ${category}`);
            try {
                await processCategory(category);
            } catch (error) {
                console.error(
                    `❌ Erreur lors du traitement de la catégorie ${category}:`,
                    error
                );
                console.log("Passage à la catégorie suivante...");
            }

            if (categories.indexOf(category) < categories.length - 1) {
                console.log(
                    "Pause de 5 minutes avant la prochaine catégorie..."
                );
                await new Promise((resolve) => setTimeout(resolve, 300000));
            }
        }

        createSummaryFile();
    }

    function createSummaryFile() {
        const summary = {
            lastUpdate: new Date().toISOString(),
            categories: categories
                .map((category) => {
                    try {
                        return JSON.parse(
                            fs.readFileSync(`results-${category}.json`, "utf8")
                        );
                    } catch (error) {
                        return null;
                    }
                })
                .filter((data) => data !== null),
        };

        fs.writeFileSync(
            "results-france.json",
            JSON.stringify(summary, null, 2)
        );
        console.log(
            "📝 Récapitulatif global sauvegardé dans results-france.json"
        );
    }

    main().catch(console.error);
}
