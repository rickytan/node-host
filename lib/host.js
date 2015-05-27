var nssocket = require('nssocket')
        , mkdirp = require('mkdirp')
        , cluster = require('cluster')
        , clc = require('cli-color')
        , Table = require('cli-table')
        , moment = require('moment')
        , debug = require('debug')('Manager')
        , EventEmitter = require('events').EventEmitter
        , fs = require('fs')
        , url = require('url')
        , http = require('http')
        , path = require('path')
        , util = require('util');

var error = clc.red.bold;
var warn = clc.yellow;
var notice = clc.blue.bold;

exports.error = function () {
    console.error(error(util.format.apply(this, arguments)));
};

exports.notice = function () {
    console.log(notice(util.format.apply(this, arguments)));
};

var config = exports.config = {
    sockFile: (function () {
        var sockdir = path.join(process.env.HOME || "~", ".nhost", "sock");
        mkdirp.sync(sockdir);
        return path.join(sockdir, "run.sock");
    })()
};

function initClient(callback) {
    var sock = config.sockFile;
    fs.exists(sock, function (exists) {
        if (exists) {
            var client = new nssocket.NsSocket();
            client.on('start', function () {
                callback(null, client);
            }).on('error', function (e) {
                if (e.code == 'ECONNREFUSED') {
                    fs.unlink(sock, callback);
                } else
                    callback(e);
            });
            client.connect(sock);
        } else {
            callback();
        }
    });
}
exports.start = function (fullpath, options) {
    function createWorker() {
        var worker = require('child_process').spawn(process.execPath, [path.join(__dirname, "worker.js")], {
            stdio: ['ipc', 1, 2],
            detached: true
        });
        worker.on('error', function (e) {
            console.log(error(e));
            process.nextTick(function () {
                process.exit(-1);
            });
        });
        worker.on('exit', function (code) {
            console.log(notice("Worker exited with code: %d", code));
        });
        worker.on('message', function (data) {
            if (data.error) {
                console.error(error(data.error));
            } else {
                console.log(notice(data.msg));
            }
            process.exit(0);
        });
        worker.send({
            cmd: 'startServer',
            params: [fullpath, options.domain, options.port, options.cluster]
        });
        worker.unref();
    }

    initClient(function (err, client) {
        if (err) {
            console.error(error(err.stack || err.message));
        } else if (client) {
            client.data(['host', 'status'], function (data) {
                var err = JSON.parse(data)[0];
                var msg = JSON.parse(data)[1];
                if (err) {
                    console.error(error(err));
                } else {
                    console.log(notice(msg));
                }
                process.exit(0);
            });
            client.send(['host', 'add'], JSON.stringify([fullpath, options]));
        } else {
            createWorker();
        }
    });
};

exports.list = function () {
    initClient(function (err, client) {
        if (err) {
            console.error(error(err.stack || err.message));
        } else if (client) {
            client.data(['host', 'status'], function (data) {
                var err = JSON.parse(data)[0];
                var result = JSON.parse(data)[1];
                if (err) {
                    console.error(error(err));
                } else {
                    // instantiate
                    var table = new Table({
                        head: ['Id', 'Domain', 'Port', 'Script', 'Uptime']
                    });

                    result.forEach(function (r) {
                        table.push([r.id, r.domain, r.port, r.scriptPath, moment(r.startDate).fromNow()]);
                    });

                    console.log(table.toString());
                }
                process.exit(0);
            });
            client.send(['host', 'list']);
        } else {
            exports.notice("Manager not running!");
        }
    });
};

exports.stop = function (id) {
    initClient(function (err, client) {
        if (err) {
            console.error(error(err.stack || err.message));
        } else if (client) {
            client.data(['host', 'status'], function (data) {
                var err = JSON.parse(data)[0];
                var result = JSON.parse(data)[1];
                if (err) {
                    console.error(error(err));
                } else {
                    console.log(result);
                }
                process.exit(0);
            });
            client.send(['host', 'remove'], id);
        } else {
            exports.notice("Manager not running!");
        }
    });
};

exports.stopall = function() {
        initClient(function (err, client) {
        if (err) {
            console.error(error(err.stack || err.message));
        } else if (client) {
            client.data(['host', 'status'], function (data) {
                var err = JSON.parse(data)[0];
                var result = JSON.parse(data)[1];
                if (err) {
                    console.error(error(err));
                } else {
                    console.log(result);
                }
                process.exit(0);
            });
            client.send(['host', 'removeall']);
        } else {
            exports.notice("Manager not running!");
        }
    });
};

exports.killall = function() {
    
};

