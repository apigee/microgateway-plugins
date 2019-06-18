var http = require('http');
var url = require('url');

var server;

exports.start = function(cb) {
  server = http.createServer(function (req, res) {

    var reqUrl = url.parse(req.url, true);

    var body = ' <headers>' + '\n';
    Object.keys(req.headers).filter(function(header) {
      // skip dynamic headers with changing values for comparison
      return ['x-request-id', 'x-forwarded-for', 'x-forwarded-host', 'via', 'host'].indexOf(header) < 0;
    }).forEach(function(header) {
      body += '  <' + header + '>' + req.headers[header] + '</' + header + '>' + '\n';
    });
    body += ' </headers>' + '\n';

    req._chunks = [];
    req.on('data', function(data) {
      req._chunks.push(data);
    });
    req.on('end', function() {
      if (req._chunks.length) {
        var incomingData = Buffer.concat(req._chunks);
        delete req._chunks;
        body += ' <body>' + '\n' + incomingData.toString() + ' </body>' + '\n'; // echo
      }
    });

    res.writeHead(200, {
        'content-type': 'text/xml',
        'transfer-encoding': 'chunked'
      }
    );

    var delay = +reqUrl.query.delay || 1000;
    var times = +reqUrl.query.times || 5;

    res.write('<message>' + '\n');
    res.write(' <delay>' + delay + '</delay>' + '\n');
    res.write(' <times>' + times + '</times>' + '\n');

    var timer = setInterval(function() {
      writeChunk(req, res, timer, body, times);
      if (--times <= 0) writeEnd(req, res, timer, body, times);
    }, delay);

  });

  server.listen(0, 'localhost', 1, function(err) {
    cb(err, server);
  });
};

exports.stop = function(cb) {
  if (server) server.close(cb);
  else cb();
}

function writeChunk(req, res, timer, body, times) {
  res.write('\n' + ' <chunk>' + times.toString() + '</chunk>' + '\n');
  res.write(body);
};

function writeEnd(req, res, timer, body, times) {
  res.end('</message>' + '\n');
  clearInterval(timer);
}