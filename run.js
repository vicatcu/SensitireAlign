// jshint esversion: 8
const fs = require('fs');
const argv = require('minimist')(process.argv.slice(2));
const parse = require('csv-parse/lib/sync');
const stringify = require('csv-stringify/lib/sync');
const path = require('path');
const moment = require('moment');
const inputEncoding = argv.e || argv.encoding || 'utf16le';
const dateFormat = 'YYYY-MM-DD HH:mm:ss';

const inputFilename = path.resolve('./', argv.i || argv.input || 'sensititre.txt');
const outputFilename = path.resolve('./', argv.o || argv.output || 'output.csv');
const parseOpts = {skip_empty_lines: true, delimiter: '\t', relaxColumnCount: true, cast: true, trim: true};
function columnNumberToLetter(num) {
    return String.fromCharCode(num + 'A'.charCodeAt(0));
}

function findDrugOffsetByFilename(files) {
  const ret = {};

  for (const inputFilename of files) {
    const inputString = fs.readFileSync(inputFilename, inputEncoding);
    const inputParsed = parse(inputString, parseOpts);

    let drugOffset = 0;
    let foundDate = false;
    for (const row of inputParsed) {
      if (foundDate) {
        break;
      }
      drugOffset = 0;
      for (const value of row) {
          if (moment(value, dateFormat, true).isValid()) {
              console.log('Found valid date string at column ' + columnNumberToLetter(drugOffset));
              foundDate = true;
              break;
          }
          drugOffset++;
      }
    }

    if (!foundDate) {
        throw new Error(`Did not find a valid date in file "${inputFilename}"`);
    }
    // the next column is the drug offset
    drugOffset++;
    console.log('Drug data starts at column ' + columnNumberToLetter(drugOffset) + `for "${inputFilename}"`);
    ret[inputFilename] = drugOffset;
  }

  return ret;
}

function findAllUniqueDrugNames(files, drugOffsets) {
  const uniqueDrugs = new Set();
  for (const inputFilename of files) {
    const inputString = fs.readFileSync(inputFilename, inputEncoding);
    const inputParsed = parse(inputString, parseOpts);
    const drugOffset = drugOffsets[inputFilename];
    for (const row of inputParsed) {
        for (let ii = drugOffset; ii < row.length; ii += 3) {
            if (row[ii] && (row[ii] !== '\u0000')) {
                uniqueDrugs.add(row[ii]);
            }
        }
    }
  }
  const drugNames = Array.from(uniqueDrugs);
  console.log('Unique drugs: ', JSON.stringify(drugNames));
  return drugNames;
}

function processOneFile(inputFilename, outputRecords, drugNames, drugOffset) {
  console.log('');
  console.log('############################################################################################################');
  console.log(`# Processing file "${inputFilename}"...`);
  console.log('############################################################################################################');
  console.log('');

  const inputString = fs.readFileSync(inputFilename, inputEncoding);
  const inputParsed = parse(inputString, parseOpts);

  // find the first column that has a valid date in it... the next column
  // is where the drugs start, and then they appear as triplets

  console.log('Reorganizing columns');
  let numRowsDroppedForDateViolation = 0;

  for (const row of inputParsed) {
      // a valid date is required right before the drugOffset
      const date = row[drugOffset - 1];
      if (!moment(date, dateFormat, true).isValid()) {
        numRowsDroppedForDateViolation++;
        continue;
      }
      let outputRow = row.slice(0, drugOffset); // copy up to the drug data
      for (const drug of drugNames) {
          const idx = row.findIndex(v => v === drug);
          if (idx >= 0) {
              outputRow = outputRow.concat(row.slice(idx, idx + 3));
          } else {
              outputRow = outputRow.concat(['', '', '']);
          }
      }
      outputRecords.push(outputRow);
  }

  console.log('Done reorganizing columns');
  console.log(`Dropped ${numRowsDroppedForDateViolation} rows because of missing date`);
}

async function run() {
    try {
        let files = [];
        if (fs.statSync(inputFilename).isDirectory()) {
          const filesInFolder = fs.readdirSync(inputFilename);
          console.log(`${inputFilename} is a directory... processing all ${filesInFolder.length} files within`);
          for (const file of filesInFolder) {
            files.push(path.resolve(inputFilename, file));
          }
        } else {
          files = [ inputFilename ];
        }

        const drugOffsetByFilename = findDrugOffsetByFilename(files);
        const uniqueDrugNames = findAllUniqueDrugNames(files, drugOffsetByFilename);

        const outputRecords = [];
        for (const file of files) {
          processOneFile(file, outputRecords, uniqueDrugNames, drugOffsetByFilename[file]);
        }

        outputString = stringify(outputRecords, {header: false, quoted_string: true});
        fs.writeFileSync(outputFilename, outputString, 'utf8');
        console.log(`Done writing file "${outputFilename}"`);
    } catch (e) {
        console.log('Error: ' + e.message, e.stack);
    }
}

run();