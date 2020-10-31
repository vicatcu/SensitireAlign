// jshint esversion: 8
const fs = require('fs');
const argv = require('minimist')(process.argv.slice(2));
const parse = require('csv-parse/lib/sync');
const stringify = require('csv-stringify/lib/sync');
const path = require('path');
const moment = require('moment');

const inputFilename = path.resolve('./', argv.i || argv.input || 'sensititre.txt');
const outputFilename = path.resolve('./', argv.o || argv.output || 'output.csv');

function columnNumberToLetter(num) {
    return String.fromCharCode(num + 'A'.charCodeAt(0));
}

async function run() {
    try {
        const inputString = fs.readFileSync(inputFilename, 'utf8');
        const inputParsed = parse(inputString, {skip_empty_lines: true});
        // find the first column that has a valid date in it... the next column
        // is where the plates start, and then they appear as triplets

        let plateOffset = 0;
        let foundDate = false;
        for (const row of inputParsed) {
          if (foundDate) {
            break;
          }
          plateOffset = 0;
          for (const value of row) {
              if (moment(value, 'M/DD/YYYY H:mm', true).isValid()) {
                  console.log('Found valid date string at column ' + columnNumberToLetter(plateOffset));
                  foundDate = true;
                  break;
              }
              plateOffset++;
          }
        }

        if (!foundDate) {
            throw new Error('Did not find a valid date in first row')
        }
        // the next column is the plate offset
        plateOffset++;
        console.log('Drug data starts at column ' + columnNumberToLetter(plateOffset));

        const uniquePlates = new Set();
        for (const row of inputParsed) {
            for (let ii = plateOffset; ii < row.length; ii += 3) {
                if (row[ii]) {
                    uniquePlates.add(row[ii]);
                }
            }
        }

        const plateNames = Array.from(uniquePlates).sort();
        console.log('Unique drugs: ', JSON.stringify(plateNames));
        const outputParsed = [];

        console.log('Reorganizing columns');
        let numRowsDroppedForDateViolation = 0;

        for (const row of inputParsed) {
            // a valid date is required right before the plateOffset
            const date = row[plateOffset - 1];
            if (!moment(date, 'M/DD/YYYY H:mm', true).isValid()) {
              numRowsDroppedForDateViolation++;
              continue;
            }
            let outputRow = row.slice(0, plateOffset); // copy up to the plate data
            for (const plate of plateNames) {
                const idx = row.findIndex(v => v === plate);
                if (idx >= 0) {
                    outputRow = outputRow.concat(row.slice(idx, idx + 3));
                } else {
                    outputRow = outputRow.concat(['', '', '']);
                }
            }
            outputParsed.push(outputRow);
        }

        console.log('Done rerganizing columns');
        console.log(`Dropped ${numRowsDroppedForDateViolation} rows because of missing date`);
        outputString = stringify(outputParsed, {header: false, quoted_string: true});
        fs.writeFileSync(outputFilename, outputString, 'utf8');
        console.log(`Done writing file "${outputFilename}"`);
    } catch (e) {
        console.log('Error: ' + e.message, e.stack);
    }
}

run();