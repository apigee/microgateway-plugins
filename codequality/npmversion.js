const { spawn } = require('child_process')




function matchVersion(counterLine) {
    return /^latest:\s+\d\.\d\./.test(counterLine)
}


var nreport = ""
var jshint = spawn('npm', ['view', '.'])
//
jshint.stdout.on('data', (data) => {
    nreport += data.toString()
  });
//
jshint.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });
//
jshint.on('close', (code) => {
    //console.log(`child process exited with code ${code}`);
    nreport = nreport.split('\n')

    nreport = nreport.map( line => {
        var justText = line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
        return(justText)
    })


    var vline = ""
    do {
        var line = nreport.pop()
        if ( matchVersion(line) ) {
            // 
            vline = line;
            break;
        }
    } while ( nreport.length > 0 )

    if ( vline.length ) {
        var vnum = vline.split(':')[1].trim()
        //console.log(vnum)
    }

    var findme = __dirname.split('/')
    findme = findme[findme.length - 2]

    var tag = findme+'@'+vnum
    console.log(tag)
  });
