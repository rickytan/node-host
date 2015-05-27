var host = require('./host')
        , App = require('./app')
        , Server = require('./server')
        , Manager = require('./manager')
        , cluster = require('cluster');

var _manager;
var _port;

process.on('uncaughtException', function (err) {
    console.error("UncaughtException:")
    console.error(err.stack || err.message);
    process.nextTick(function () {
        process.exit(1);
    });
});

process.on('message', function (data) {
    switch (data.cmd) {
        case 'startServer':
            var app = new App(data.params[0]);
            var server = new Server(app, data.params[1], data.params[2], data.params[3]);
            if (_manager && _port == server.port) {
                _manager.addServer(server, function (err, msg) {
                    if (err) {
                        host.error(err);
                    } else {
                        host.notice(msg);
                    }
                });
            } else {
                _manager = new Manager();
                _manager.start(function (err) {
                    if (err) {
                        console.error(err);
                        return process.exit(1);
                    } else {
                        process.send({
                            msg: "Host manager started!"
                        });
                        _manager.addServer(server, function (err, msg) {
                            if (err) {
                                host.error(err);
                            } else if (msg) {
                                host.notice(msg);
                            }
                            _port = server.port;
                        });
                    }
                });
            }
            break;
        case 'addServer':
            var app = new App(data.params[0]);
            var server = new Server(app, data.params[1], data.params[2], data.params[3]);
            _manager.addServer(server, function (err, msg) {
                if (err) {
                    host.error(err);
                } else {
                    host.notice(msg);
                }
            });
            break;
        case 'getPort':
            process.send({
                id: cluster.worker.id,
                port: _port
            });
            break;
        default:
            break;
    }
});

