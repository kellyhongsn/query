const puppeteer = require('puppeteer');
const { openai } = require('../utils/config');
const cheerio = require('cheerio');

async function depthSearch(link, query) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    let htmlCode = '';
    let screenshot = '';
    let extractedText = '';
    let generatedQueries = [];

    try {
        await page.goto(link, { waitUntil: 'networkidle0' });
        htmlCode = await page.content();
        screenshot = await page.screenshot({ encoding: 'base64' });

        const { keywords, clickAction } = await analyzeScreenshot(screenshot, query);
        
        if (clickAction) {
            const clickableElement = await findClickableElement(page, clickAction);
            if (clickableElement) {
                await clickableElement.click();
                await page.waitForNavigation({ waitUntil: 'networkidle0' });
                htmlCode = await page.content();
                screenshot = await page.screenshot({ encoding: 'base64' });
            }
        }

        extractedText = await extractFromKeywords(htmlCode, keywords);
        generatedQueries = await generateQueries(extractedText, query);
    } catch (error) {
        console.error('Error in depthSearch:', error);
    } finally {
        await browser.close();
    }

    return {
        generatedQueries
    };
}

async function analyzeScreenshot(screenshot, query) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You are an AI assistant specialized in analyzing web page screenshots and identifying relevant content and actions."
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: `Analyze this screenshot in relation to the query: "${query}". Provide the following:
                                1. What are the 3-5 most relevant keywords or phrases?
                                2. Is there any specific button or link that should be clicked to get more relevant content? If yes, describe it precisely.`
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${screenshot}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 300
        });

        const content = response.choices[0].message.content;
        const lines = content.split('\n');
        
        const keywords = lines
            .find(line => line.startsWith('1.'))
            ?.replace('1.', '')
            .split(',')
            .map(keyword => keyword.trim())
            .filter(keyword => keyword !== '') || [];

        const clickAction = lines
            .find(line => line.startsWith('2.'))
            ?.replace('2.', '')
            .trim();

        return { keywords, clickAction };
    } catch (error) {
        console.error('Error in analyzeScreenshot:', error);
        return { keywords: [], clickAction: null };
    }
}

async function findClickableElement(page, clickAction) {
    if (!clickAction || clickAction.toLowerCase().includes('no') || clickAction.toLowerCase().includes('none')) {
        return null;
    }

    return await page.evaluateHandle((action) => {
        const elements = [...document.querySelectorAll('a, button')];
        return elements.find(el => 
            el.textContent.toLowerCase().includes(action.toLowerCase()) ||
            el.getAttribute('aria-label')?.toLowerCase().includes(action.toLowerCase())
        );
    }, clickAction);
}

async function extractFromKeywords(htmlCode, keywords) {
    const $ = cheerio.load(htmlCode);
    let extractedTexts = [];

    $('body *').each((_, element) => {
        const text = $(element).text().trim();
        if (text) {
            for (const keyword of keywords) {
                if (text.toLowerCase().includes(keyword.toLowerCase())) {
                    const start = Math.max(0, text.toLowerCase().indexOf(keyword.toLowerCase()) - 150);
                    const end = Math.min(text.length, start + 300);
                    extractedTexts.push(text.slice(start, end));
                    break;
                }
            }
        }
    });

    return extractedTexts.join('\n\n');
}

async function generateQueries(extractedText, originalQuery) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "You are an AI assistant tasked with generating search queries based on extracted text and an original query." },
            { role: "user", content: `Given the following extracted text and original query, generate 3 specific search queries that will help find information to comprehensively answer the original query:\n\nExtracted text: ${extractedText}\n\nOriginal query: ${originalQuery}` }
        ],
        max_tokens: 150
    });

    return response.choices[0].message.content.split('\n');
}

module.exports = { depthSearch };