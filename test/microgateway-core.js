
/* simulating the objects of microgateway-core to avoid run time errors in travis. */
module.exports = {
    logger: {
        info: function (obj, msg) { },
        warn: function (obj, msg) { },
        error: function (obj, msg) {},
        eventLog: function (obj, msg) {},
        stats: function (statsInfo, msg) {},
        setLevel: function (level) {},
        writeLogRecord: function(record,cb) {},
        consoleLog: function (level, ...data) {}
    },
    stat: {
        incrementRequestCount: function() {},
        incrementResponseCount: function() {},
        incrementRequestErrorCount: function() {},
        incrementResponseErrorCoun: function() {},
        incrementStatusCount: function(code) {}
    }
}