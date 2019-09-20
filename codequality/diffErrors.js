/* eslint-disable no-multiple-empty-lines */

const { spawn } = require('child_process')
const { promisify } = require('util')
const fs = require('fs')
const colors = require('colors')


var prevQTag = process.argv[2]
if ( prevQTag === undefined ) {
    console.log("tag parameter must be supplied")
    process.exit(1)
}


var gPrevQualMap = JSON.parse(fs.readFileSync('prevCount.json','ascii').toString())
var gCurrentQual = {
    "error_count" : 0,
    "by_file" : {},
    "quality" : 0,
    "syntax" : 0
}


var gPrevQual = gPrevQualMap[prevQTag]

if ( gPrevQual == undefined ) {
    console.log('the map of previous qualities does not include the tag')
    process.exit(1)
}



async function getQuality(dir) {
    return new Promise( (resolve,reject) => {
        var qreport = ""
        var jshint = spawn('jshint', [dir])
        //
        jshint.stdout.on('data', (data) => {
            qreport = data.toString()
          });
        //
        jshint.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
            reject('ERROR')
          });
        //
        jshint.on('close', (code) => {
            //console.log(`child process exited with code ${code}`);
            resolve(dir  + '\n' + qreport)
          });
    })
}


function matchCounter(counterLine) {
    return /^\d+\serrors$/.test(counterLine)
}


function classifyError(qObject,line) {
    //console.log(line)
    var isSyntax = true

    if ( (line.indexOf('cyclomatic') > 0) || (line.indexOf('has too many statements.') > 0) ) {
        isSyntax = false
    }

    if ( isSyntax ) {
        qObject.syntax++
    } else {
        qObject.quality++
    }
}


const APPEND_PATTERN = '/index.js'


// 
var dirList = undefined;

if ( dirList == undefined ) {
    dirList = fs.readFileSync("dirs.txt").toString()
    dirList = dirList.trim().split('\n')
    dirList = dirList.map(dirname => {
        //console.log(`../${dirname}${APPEND_PATTERN}`)
        return(`../${dirname}${APPEND_PATTERN}`)
    })
} else {
    dirList = JSON.parse(dirList)
}

if ( dirList !== undefined ) {

    var loadQuality = (dirs) => {
        var qualPromise = dirs.map(async (dir) => {
            return(await getQuality(dir))
        })

        return(qualPromise)
    }

    var promises = loadQuality(dirList);

    Promise.all(promises).then(reports => {
        //
        var totalErrors = 0
        var byFile = {}
        var reportFileCounts = ""


        reports.forEach(report => {
            var lines = report.split('\n')
            var dir = lines.shift()
            var counterLine = ""
            do {
                var line = lines.pop()
                line = line.trim()
                if ( matchCounter(line) ) {
                    counterLine = line
                    //console.log(counterLine)
                } else if ( line.length > 0 ) {
                    classifyError(gCurrentQual,line)
                }
                //
            } while ( lines.length > 0 )
            //
            if ( counterLine.length > 0 ) {
                reportFileCounts += `${counterLine} ${dir}` + '\n'
                var cc = parseInt(counterLine)
                totalErrors += cc
                byFile[dir] = cc
            }
        })
        //
        // Code quality rerport
        console.log("\n\n" + colors.underline(colors.blue.bold("CODE QUALITY REPORT") + " for modules in " + __dirname ) + '\n')
        var countDiff = totalErrors - gPrevQual.error_count
        console.log(colors.bold('Error Change:') 
                + ( countDiff > 0 ? colors.red( ` ${countDiff},  ` )  :  colors.green( ` ${countDiff},  ` )  )
                + colors.bold('Current: ') 
                +  `${totalErrors},  ` 
                + colors.bold('Previous: ') 
                +  `${gPrevQual.error_count}`)
        console.log(reportFileCounts)
        //

        // Code quality data
        gCurrentQual.error_count = totalErrors;
        gCurrentQual.by_file = byFile;
        console.dir(gCurrentQual,{ color: true, depth: 2})
        console.log('\n')
        
        var report = JSON.stringify(gCurrentQual,null,2) + "\n"
        fs.writeFileSync('currentCount.dat',report,'ascii')

    }).catch(err => {
        console.error(err)
    })

}
