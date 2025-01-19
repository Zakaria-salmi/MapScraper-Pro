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
const CONCURRENT_WORKERS = 3;
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
            // Recherche des coordonnées avec le pattern !3d et !4d
            const latMatch = url.match(/!3d(-?\d+\.\d+)/);
            const lngMatch = url.match(/!4d(-?\d+\.\d+)/);

            if (latMatch && lngMatch) {
                return {
                    latitude: parseFloat(latMatch[1]),
                    longitude: parseFloat(lngMatch[1]),
                };
            }

            // Fallback : recherche du pattern @lat,lng si la première méthode échoue
            const fallbackMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
            if (fallbackMatch) {
                return {
                    latitude: parseFloat(fallbackMatch[1]),
                    longitude: parseFloat(fallbackMatch[2]),
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

    async function scrapeRestaurantDetails(page, url) {
        await page.goto(url);
        await page.waitForSelector("h1", { timeout: 5000 }).catch(() => null);

        const coordinates = await extractGpsFromUrl(url);

        const details = await page.evaluate((coords) => {
            const getData = (selector, attribute = "text") => {
                try {
                    const element = document.querySelector(selector);
                    if (!element) return "Non disponible";
                    return attribute === "text"
                        ? element.textContent.trim()
                        : element.getAttribute(attribute);
                } catch {
                    return "Non disponible";
                }
            };

            // Extraire le nom
            let name = "Non disponible";
            try {
                const nameElement =
                    document.querySelector("h1.DUwDvf") ||
                    document.querySelector("h1.fontHeadlineLarge") ||
                    document.querySelector("#QA0Szd h1");
                if (nameElement) {
                    name = nameElement.textContent.trim();
                }
            } catch (e) {
                console.error("Erreur lors de l'extraction du nom:", e);
            }

            // Extraire la note, le nombre d'avis, la tranche de prix et le type
            let rating = "Non disponible";
            let reviewCount = "Non disponible";
            let priceRange = "Non disponible";
            let restaurantType = "Non disponible";

            try {
                // Extraction du type de restaurant d'abord pour le filtrage rapide
                const typeElement = document.querySelector(
                    "#QA0Szd > div > div > div.w6VYqd > div:nth-child(2) > div > div.e07Vkf.kA9KIf > div > div > div.TIHn2 > div > div.lMbq3e > div.LBgpqf > div > div:nth-child(2) > span:nth-child(1) > span > button"
                );
                if (typeElement) {
                    restaurantType = typeElement.textContent.trim();
                    // Si c'est un supermarché, on arrête immédiatement
                    if (restaurantType === "Supermarché") {
                        return null;
                    }
                }

                // Vérification des avis
                const reviewElement = document.querySelector(
                    "#QA0Szd > div > div > div.w6VYqd > div:nth-child(2) > div > div.e07Vkf.kA9KIf > div > div > div.TIHn2 > div > div.lMbq3e > div.LBgpqf > div > div.fontBodyMedium.dmRWX > div.F7nice > span:nth-child(2) > span > span"
                );
                if (!reviewElement) {
                    // Si pas d'avis, on arrête
                    return null;
                }
                const reviewText = reviewElement.textContent.trim();
                const match = reviewText.match(/(\d+)/);
                if (!match) {
                    // Si pas de nombre d'avis trouvé, on arrête
                    return null;
                }
                reviewCount = parseInt(match[1]);

                const ratingElement = document.querySelector(
                    'div.F7nice span[aria-hidden="true"]'
                );
                if (ratingElement) {
                    rating = parseFloat(
                        ratingElement.textContent.replace(",", ".")
                    );
                }

                // Extraction de la tranche de prix
                const priceElement = document.querySelector(
                    "#QA0Szd > div > div > div.w6VYqd > div:nth-child(2) > div > div.e07Vkf.kA9KIf > div > div > div.TIHn2 > div > div.lMbq3e > div.LBgpqf > div > div.fontBodyMedium.dmRWX > span > span > span > span:nth-child(2) > span > span"
                );
                if (priceElement) {
                    priceRange = priceElement.textContent.trim();
                }
            } catch (e) {
                console.error("Erreur lors de l'extraction des détails:", e);
                return null;
            }

            // Récupérer les horaires
            const hours = {};
            const scheduleRows = document.querySelectorAll("table.eK4R0e tr");
            scheduleRows.forEach((row) => {
                try {
                    const day = row.querySelector(".ylH6lf").textContent.trim();
                    const time = row
                        .querySelector(".mxowUb")
                        .textContent.trim();
                    hours[day] = time;
                } catch (e) {}
            });

            return {
                name: name,
                address: getData("button[data-item-id='address'] div.Io6YTe"),
                phone: getData("button[data-item-id^='phone:tel:'] div.Io6YTe"),
                website: getData("a[data-item-id='authority']", "href"),
                hours: Object.keys(hours).length > 0 ? hours : "Non disponible",
                coordinates: coords,
                rating: rating,
                reviewCount: reviewCount,
                priceRange: priceRange,
                restaurantType: restaurantType,
            };
        }, coordinates);

        // Si details est null, on ignore ce restaurant
        if (!details) {
            console.log("Restaurant ignoré : pas d'avis ou supermarché");
            return null;
        }

        // Extraire les photos après avoir récupéré tous les autres détails
        let photos = [];
        try {
            const galleryButtonSelector =
                "#QA0Szd > div > div > div.w6VYqd > div:nth-child(2) > div > div.e07Vkf.kA9KIf > div > div > div.ZKCDEc > div.RZ66Rb.FgCUCc > button";
            await page.waitForSelector(galleryButtonSelector, {
                timeout: 5000,
            });
            await page.click(galleryButtonSelector);
            await page.waitForSelector("a[data-photo-index]", {
                timeout: 5000,
            });

            photos = await page.evaluate(() => {
                const photoUrls = [];
                let currentIndex = 0;

                while (photoUrls.length < 7 && currentIndex < 50) {
                    const photoContainer = document.querySelector(
                        `a[data-photo-index="${currentIndex}"]`
                    );
                    if (!photoContainer) break;

                    const photoElement =
                        photoContainer.querySelector("div.U39Pmb");
                    if (photoElement) {
                        const isVideo =
                            photoElement.querySelector(
                                "div.fontLabelMedium.a3lFge"
                            ) !== null;

                        if (!isVideo) {
                            const style = photoElement.getAttribute("style");
                            const urlMatch = style.match(/url\("([^"]+)"\)/);
                            if (urlMatch && urlMatch[1]) {
                                const cleanUrl = urlMatch[1].replace(
                                    /=w\d+-h\d+-k-no/,
                                    "=w2000-h2000-k-no"
                                );
                                if (cleanUrl.startsWith("https://")) {
                                    photoUrls.push(cleanUrl);
                                }
                            }
                        }
                    }

                    currentIndex++;
                }

                return photoUrls;
            });

            await page.keyboard.press("Escape");
            await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
            console.log("Erreur lors de l'extraction des photos:", error);
        }

        // Ne retourner que les photos si nous en avons, sinon "Non disponible"
        return {
            ...details,
            photos: photos.length > 0 ? photos : "Non disponible",
        };
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

        // Récupérer les détails pour chaque restaurant
        const detailedResults = [];
        for (const result of results) {
            try {
                console.log(`📍 Scraping détails pour: ${result.name}`);
                const details = await scrapeRestaurantDetails(page, result.url);
                if (details) {
                    // On ajoute seulement si details n'est pas null
                    detailedResults.push({
                        ...details,
                        originalUrl: result.url,
                    });
                }
                await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(
                    `Erreur lors du scraping des détails pour ${result.name}:`,
                    error
                );
            }
        }

        const coords = await extractGpsFromUrl(url);
        return {
            coordinates: coords,
            results: detailedResults,
            total: detailedResults.length,
        };
    }

    async function processUrl() {
        const browser = await puppeteer.launch({
            headless: true,
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
                        "Pause de 10 secondes avant le prochain groupe..."
                    );
                    await new Promise((resolve) => setTimeout(resolve, 10000));
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
                    "Pause de 1 minutes avant la prochaine catégorie..."
                );
                await new Promise((resolve) => setTimeout(resolve, 60000));
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
