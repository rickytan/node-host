var program = require('commander')
        , path = require('path')
        , manager = require('./manager');

exports = module.exports = function () {
    program.version(require("../package.json").version);
    program
            .command("start <node_app>")
            .description("start a node web app with a domain name and port")
            .option('-p, --port [port]', 'listen port, default is 80', 80)
            .option('-H, --hostname <domain>', 'server domain name')
            .option('-c, --cluster [n]', 'number of clusters, default is 1, if 0 provided, then it will use number of CPU cores of the machine', 1)
            .on('--help', function () {
                console.log("  Examples:\n");
                console.log("    $ nhost start -d my.host.com -p 8080 app.js");
                console.log("    $ nhost start -d my.host.com /path/to/app/");
                console.log();
            })
            .action(function (cmd, options) {
                
                try {
                    manager.start(cmd, {
                        domain: options.hostname,
                        port: options.port,
                        cluster: options.cluster
                    });
                } catch (e) {
                    console.error("Can't start App %s", cmd);
                }
            });

    program.parse(process.argv);

    if (process.argc <= 2)
        program.help();
};