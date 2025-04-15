const fs = require('fs');
const path = require('path');  // Import 'path' module to handle file paths

console.log('');
console.log("!!!PROBABLY ONLY USE THIS ON INNER POCKETS WITH NO ISLANDS!!!")
console.log('');

function getHeights(lines) {
    // get safe height from first few lines of code
    let firstLineNumber
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '' || line.startsWith(';')) {
            continue;
        }
        const speedMatch = line.match(/S[\-0-9.]+M3/);
        if (speedMatch) {
            firstLineNumber = i+1;
            break;
        }
    }
    let safeHeightLine = lines[firstLineNumber].trim();
    let safeHeightMatch = safeHeightLine.match(/G0.*Z([\-0-9.]+)/);
    if (!safeHeightMatch) { // Quick fix for after upgrading to aspire v12... seems to split up these position initialization lines probably to first move XY then Z for safety
        firstLineNumber++
        safeHeightLine = lines[firstLineNumber].trim();
        safeHeightMatch = safeHeightLine.match(/G0.*Z([\-0-9.]+)/);
    }
    const safeHeight = parseFloat(safeHeightMatch[1]);
    console.log(`   Safe height identified as ${safeHeight}mm or ${safeHeight/25.4}in` )

    const materialTopLine = lines[firstLineNumber + 1].trim();
    const materialTopMatch = materialTopLine.match(/G1.*Z([\-0-9.]+)/);
    const materialTop = parseFloat(materialTopMatch[1]);
    console.log(`   Material top identified as ${materialTop}mm or ${materialTop/25.4}in` )

    for (let j = firstLineNumber + 1; j < lines.length; j++) {
        const forwardLine = lines[j].trim();
        if (!forwardLine.match(/G1.*Z[\-0-9.]+/)){
            const LastZLine = lines[j-1].trim()
            const match = LastZLine.match(/G1.*Z([\-0-9.]+)/);
            const layerHeight = parseFloat(match[1]) - materialTop
            console.log(`   Layer height identified as ${layerHeight}mm or ${layerHeight/25.4}in` )
            console.log('');

            return {safeHeight, layerHeight, materialTop, firstLineNumber}
        }
    }
}

function removeZHeightResets(data) {
    const lines = data.split('\n');

    let deepestZ = Infinity;
    const {safeHeight, layerHeight, materialTop, firstLineNumber} = getHeights(lines);
    const pockets = [];
    let lastPocketStart = firstLineNumber;
    const beginning = lines.slice(0,firstLineNumber);
    let end;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '' || line.startsWith(';')) {
            continue;
        }

        const zMatch = line.match(/G1.*Z([\-0-9.]+)/);
        if (zMatch) {
            const z = parseFloat(zMatch[1])
            // find ends of pockets by following cut depth downwards until it resets to layerheight or greater (negative values), hopefully avoiding tabs
            if (z < deepestZ) {
                deepestZ = z
            } else if (z > deepestZ && (z < safeHeight && z >= layerHeight)) {
                // ignore safeheights, as these are achieved by z safe pullouts on layer change
                // console.log("Cut depth reset!", z, i, line)
                deepestZ = z
                pockets.push(lines.slice(lastPocketStart, i - 1))

                lastPocketStart = i-1
            }
        }

        const motorOffMatch = line.match(/M5/)
        if (motorOffMatch) {
            // find end of program when motor shuts off
            pockets.push(lines.slice(lastPocketStart, i))
            end = lines.slice(i, lines.length)
            break;
        }
    }

    let resetsRemoved = 0
    for (const pocket of pockets) {
        for (let i = pocket.length - 2; i >= 0; i--) {
            // note start at -2 because the last line is the final z reset which is needed
            const zResetMatch = pocket[i].match(new RegExp(`G0Z${safeHeight}`));
            if (zResetMatch) {
                pocket.splice(i, 1);
                resetsRemoved++
            }
        }
    }

    // For checking to confirm pocket line starts and ends
    // let linecount = beginning.length
    // for (const pocket of pockets) {
    //     console.log(pocket[0])
    //     console.log(pocket[pocket.length-1])

    //     linecount+=pocket.length
    //     console.log('')
    // }
    // linecount+=end.length
    // console.log(end[0])
    // console.log(linecount === lines.length)

    console.log(`Number of pockets:`, pockets.length);
    console.log(`Number of resets removed:`, resetsRemoved);

    return beginning.concat(...pockets, end);
}

// Check if the filename was passed as a parameter
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Please provide the G-code file as a command-line parameter.');
    process.exit(1);
}

const filename = args[0];

const extname = path.extname(filename); 
const basename = path.basename(filename, extname);
const modifiedFilename = `${basename} NO ZHOPS${extname}`;

// Read the G-code file
fs.readFile(filename, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading G-code file:', err);
        return;
    }

    const modifiedCode = removeZHeightResets(data);
    const modifiedFile = modifiedCode.join('\n');

    fs.writeFile(modifiedFilename, modifiedFile, (err) => {
        if (err) {
            console.error('Error writing to file', err);
        } else {
            console.log(`File written successfully as ${modifiedFilename}`);
        }
    });
});