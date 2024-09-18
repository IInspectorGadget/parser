const puppeteer = require("puppeteer");
const fs = require("fs");

// Функция для установки региона
async function setRegion(page, region) {
  console.log("SetRegion");
  const currentRegion = await page.evaluate(() => {
    const regionElement = document.querySelector(
      ".Region_region__6OUBn span:nth-child(2)"
    );
    return regionElement ? regionElement.textContent.trim() : null;
  });

  if (currentRegion === region) {
    console.log(`Регион "${region}" уже выбран.`);
    return;
  }

  // Открываем выбор региона
  await page.waitForSelector(".Region_region__6OUBn", { visible: true });
  await page.click(".Region_region__6OUBn");

  // Ожидаем появления списка регионов
  await page.waitForSelector(".UiRegionListBase_listWrapper__Iqbd5", {
    visible: true,
  });

  // Поиск и выбор региона
  const regionList = await page.$$(".UiRegionListBase_item___ly_A");
  for (const regionItem of regionList) {
    const regionText = await page.evaluate(
      (el) => el.textContent.trim(),
      regionItem
    );
    if (regionText.includes(region)) {
      await regionItem.click();
      await page.waitForNavigation();
      console.log(`Регион "${region}" выбран.`);
      return;
    }
  }
  throw new Error("Регион не найден");
}

// Функция для получения ценовой информации
async function getPriceInfo(page) {
  return await page.evaluate(() => {
    const prices = {
      oldPrice: null,
      newPrice: null,
      singlePrice: null,
      unit: null,
    };

    const priceBlock = document.querySelector(
      ".ProductPage_informationBlock__vDYCH"
    );
    if (!priceBlock) return prices;

    const singlePriceElement = priceBlock.querySelector(
      ".Price_role_regular__X6X4D"
    );

    if (singlePriceElement) {
      prices.singlePrice = singlePriceElement.textContent.trim();
      const unitElement = singlePriceElement.querySelector(
        ".Price_fraction__lcfu_"
      );
      if (unitElement)
        prices.unit = unitElement.textContent.trim().replace(/[\d.,\s]/g, "");
    } else {
      const newPriceElement = priceBlock.querySelector(
        ".Price_role_discount__l_tpE"
      );

      if (newPriceElement) {
        prices.newPrice = newPriceElement.textContent.trim();
        const unitElement = newPriceElement.querySelector(
          ".Price_fraction__lcfu_"
        );
        if (unitElement)
          prices.unit = unitElement.textContent.trim().replace(/[\d.,\s]/g, "");
      }
      const oldPriceElement = priceBlock.querySelector(
        ".PriceInfo_oldPrice__IW3mC .Price_price__QzA8L"
      );

      if (oldPriceElement) {
        prices.oldPrice = oldPriceElement.textContent.trim();
      }
    }

    return prices;
  });
}

// Функция для получения рейтинга и количества отзывов
async function getRatingAndReviews(page) {
  return await page.evaluate(() => {
    const ratingAndReviewsBlock = document.querySelector(
      ".ProductPage_title__3hOtE .ActionsRow_root__nIier"
    );
    let rating = "Нет данных";
    let reviews = "Нет данных";

    if (ratingAndReviewsBlock) {
      const ratingElement = ratingAndReviewsBlock.querySelector(
        ".ActionsRow_stars__EKt42"
      );
      const reviewsElement = ratingAndReviewsBlock.querySelector(
        ".ActionsRow_reviews__AfSj_"
      );

      if (ratingElement) rating = ratingElement.textContent.trim();
      if (reviewsElement)
        reviews = reviewsElement.textContent.trim().replace(/[^\d]/g, "");
    }

    return { rating, reviews };
  });
}

// Функция для сохранения скриншота
async function saveScreenshot(page, path) {
  await page.screenshot({ path, fullPage: true });
}

// Функция для записи информации о товаре в файл
function writeProductData(prices, rating, reviews, filePath) {
  let priceInfo = "";
  if (prices.oldPrice && prices.newPrice) {
    priceInfo = `Старая цена: ${prices.oldPrice}\nНовая цена: ${prices.newPrice}`;
  } else if (prices.singlePrice) {
    priceInfo = `Цена: ${prices.singlePrice}`;
  } else {
    priceInfo = "Цены не найдены";
  }

  const productData = `${priceInfo}\nРейтинг: ${rating}\nКоличество отзывов: ${reviews}\n`;
  fs.writeFileSync(filePath, productData);
}

async function savePrepare(page) {
  // Нажатие на кнопку согласия с cookies
  const agreeButtonSelector = "div.CookiesAlert_agreeButton__cJOTA button";
  await page.waitForSelector(agreeButtonSelector);
  await page.click(agreeButtonSelector);

  // Ожидание загрузки блока с аккордеонами
  const accordionContainerSelector =
    "section.Details_container__0TCXF > div:last-child";
  await page.waitForSelector(accordionContainerSelector);

  // Получаем все аккордеоны в блоке
  const accordionSelector =
    "div.shared_accordionWrapper__svSgl details.Accordion_accordion__lRPiL.Accordion_medium__yJ9YA";
  const accordions = await page.$$(accordionSelector);

  for (const accordion of accordions) {
    // Проверяем, открыт ли аккордеон, и только если нет, то открываем его
    const isOpen = await page.evaluate(
      (el) => el.hasAttribute("open"),
      accordion
    );
    if (!isOpen) {
      await accordion.click();
    }
  }

  // Закрытие тултипа, если он присутствует
  const tooltipCloseButtonSelector =
    "div.Tooltip_root__EMk_3 .Tooltip_closeIcon__skwl0";
  await page
    .waitForSelector(tooltipCloseButtonSelector, { timeout: 5000 })
    .catch(() => console.log("Tooltip not found"));
  await page.click(tooltipCloseButtonSelector);
  await page.evaluate(() => {
    const stickyElement = document.querySelector(
      ".StickyPortal_root__5NZsr.StickyPortal_showing__TqUwE"
    );
    if (stickyElement) {
      stickyElement.style.display = "none";
    }
  });
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function scrapeProduct(url, region) {
  // Настройка браузера
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    // Настройка страницы
    const page = await browser.newPage({ waitUntil: "domcontentloaded" });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
    );
    await page.setViewport({ width: 1280, height: 720 });
    // Настройка контекста (устанавливаем значение геолокации для предотвращения появления окна с разрешение на предоставление данных о геолокации)

    // Переход на страницу
    await page.goto(url);
    // Выбор региона
    await setRegion(page, region);
    // Получение данных о товаре
    const [prices, { rating, reviews }] = await Promise.all([
      getPriceInfo(page),
      getRatingAndReviews(page),
    ]);
    // Преобразование старой цены, если нужно
    if (prices.oldPrice && prices.unit) {
      const oldPriceValue = prices.oldPrice.replace(/[^\d.,]/g, "").trim();
      prices.oldPrice = `${oldPriceValue} ${prices.unit}`;
    }

    // Сохраняем скриншот страницы товара
    await savePrepare(page);
    await saveScreenshot(page, "screenshot.jpg");

    // Записываем данные о товаре в файл
    writeProductData(prices, rating, reviews, "product.txt");
  } catch (error) {
    console.error("Произошла ошибка:", error);
  } finally {
    await browser.close();
  }
}

// Получаем аргументы командной строки
const [url, region] = process.argv.slice(2);

if (!url || !region) {
  console.error("Необходимо передать URL товара и регион.");
  process.exit(1);
}

// Запуск скрипта
scrapeProduct(url, region)
  .then(() => console.log("Скриншот и данные о товаре сохранены."))
  .catch((error) => console.error("Произошла ошибка:", error));
