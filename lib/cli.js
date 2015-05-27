var program = require('commander')
        , path = require('path')
        , host = require('./host');

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
                console.log("    $ nhost start -H my.host.com -p 8080 app.js");
                console.log("    $ nhost start -H foo.bar.com /path/to/app/");
                console.log();
            })
            .action(function (cmd, options) {
                try {
                    host.start(cmd, {
                        domain: options.hostname,
                        port: options.port,
                        cluster: options.cluster
                    });
                } catch (e) {
                    console.error("Can't start App %s", cmd);
                    console.error(e.stack || e.message);
                }
            });
    program.command("list")
            .description("list the running server on the host")
            .action(function (cmd, options) {
                host.list();
            });
    program.command("stop <id>")
            .description("stop a server by id")
            .action(function (cmd, options) {
                host.stop(cmd);
            });
    program.command("stopall")
            .description("stop all servers")
            .action(function (cmd, options) {
                host.stopall();
            });
    program.command("killall")
            .description("kill all workers, to free the listening ports")
            .action(function (cmd, options) {
                host.killall();
            });
    program.parse(process.argv);
    
    if (process.argv.length <= 2)
        program.help();
};