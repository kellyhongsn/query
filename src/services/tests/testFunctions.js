const { classifyQuery } = require('../autoSearch');

async function main() {
    const sampleQuery = "research papers on protein structure prediction";
    try {
        const category = await classifyQuery(sampleQuery);
        console.log(`The category for the query "${sampleQuery}" is: ${category}`);
    } catch (error) {
        console.error('Error classifying query:', error);
    }
}

main();