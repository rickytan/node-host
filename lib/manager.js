var nssocket = require('nssocket')
        , mkdirp = require('mkdirp')
        , cluster = require('cluster')
        , clc = require('cli-color')
        , EventEmitter = require('events').EventEmitter
        , fs = require('fs')
        , url = require('url')
        , http = require('http')
        , path = require('path')
        , util = require('util');

var error = clc.red.bold;
var warn = clc.yellow;
var notice = clc.blue;

function sockFile() {
    var sockdir = path.join("~", ".nhost", "sock");
    mkdirp.sync(sockdir);
    return path.join(sockdir, "run.sock");
}

var Manager = function () {
    EventEmitter.call(this);

    this._sock = null;
    this._socket = null;
    this._servers = [];
    this._domains = {};
    this._ports = {};
};

util.inherits(Manager, EventEmitter);

Manager.prototype.start = function () {
    /*
     if (cluster.isMaster) {
     // Count the machine's CPUs
     var cpuCount = require('os').cpus().length;
     
     // Create a worker for each CPU
     for (var i = 0; i < cpuCount; ++i) {
     cluster.fork();
     }
     } else {
     */
    this._socket = nssocket.createServer(function (socket) {
        socket.data(['host', 'add'], function (data) {

        });
        socket.data(['host', 'remove'], function (data) {

        });
    });
    /*
     }
     cluster.on('exit', function (worker) {
     warn("Worker %d exited! fork a new one", worker.id);
     cluster.fork();
     });
     */
};

Manager.prototype.addServer = function (server) {
    var self = this;
    if (this._domains[server.domain] &&
            this._domains[server.domain].port == server.port) {
        return error("Domain %s with port %d already exists!", server.domain, server.port);
    }
    this._servers.push(server);
    if (!this._domains[server.domain]) {
        this._domains[server.domain] = [];
    }
    this._domains[server.domain].push(server);

    if (!this._ports["" + server.port]) {
        this._ports["" + server.port] = [];

        if (cluster.isMaster) {
            var cpus = server.cluster || 0;
            if (cpus == 0) {
                cpus = require('os').cpus().length;
            }
            for (var i = 0; i < cpus; ++i) {
                cluster.fork();
            }
            cluster.on('exit', function (worker, code, signal) {
                console.log(warn('worker ' + worker.process.pid + ' exited with code: ' + code));
            });
        } else {
            var httpServer = http.createServer(function (req, res) {
                var domain = req.domain || req.headers.host.split(':')[0];
                var port = req.headers.host.split(':')[1] || "80";
                console.log(warn(cluster.worker.id));
                var refer = req.headers.refer;
                var servers = ((self._domains[domain] || []).length < (self._ports[port] || []).length ? self._domains[domain] : self._ports[port]) || [];
                if (servers.every(function (s) {
                    if (s.domain == domain && s.port == port) {
                        s.app.handler(req, res);
                        return false;
                    }
                    return true;
                })) {
                    res.writeHead(200, {
                        'Content-Type': 'text/html'
                    });
                    res.end("<h1>No app binded to this domain!</h1>");
                }
            });

            httpServer.listen(server.port);
            httpServer.on('error', function (e) {
                console.log(error(e));
            });
            httpServer.on('listening', function () {
                console.log(notice("Listening on %d"), server.port);
            });
            server._server = httpServer;
        }
    } else {
        server._server = this._ports["" + server.port][0]._server;
    }
    this._ports["" + server.port].push(server);
    server.startDate = new Date();
    console.log(notice("Server %s:%d added!"), server.domain, server.port);
};

Manager.prototype.removeServer = function (server) {

};

Manager.prototype.findByDomain = function (domain) {

};

Manager.prototype.findByIndex = function (index) {

};

exports.Manager = module.exports.Manager = Manager;

var Server = function (app, domain, port, cluster) {
    this.app = app;
    this.domain = domain.trim();
    this.cluster = cluster || 1;
    this.path = "/";
    this.port = parseInt(port) || 80;
};

exports.Server = module.exports.Server = Server;

exports.App = module.exports.App = function (execPath) {
    this.appPath = execPath;
    this.fullPath = path.join(process.cwd(), execPath);
    try {
        this.handler = require(execPath);
        if (typeof this.handler !== 'function') {
            throw new Error("Not a valid app! the main entry must export a function with signutrue function(req, res)");
        }
    } catch (e) {
        error(e);
    }
};

exports.start = function (fullpath, options) {
    var sock = sockFile();
    fs.exists(sock, function (exists) {
        if (exists) {
            var client = new nssocket.NsSocket();
            client.on('start', function () {

            }).on('error', function (e) {
                console.error(e);
            });
            client.connect(sock);
        } else {
            warn(path.join(__dirname, "worker.js"));
            var worker = require('child_process').spawn(process.execPath, [path.join(__dirname, "worker.js"), fullpath, options.domain, options.port, options.cluster], {
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
            worker.on('message', function (message) {
                console.log(warn(message));
                process.exit(0);
            });
            worker.unref();
            // fs.write
        }
    });
};
