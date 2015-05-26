
// Functions which will be available to external callers
exports = module.exports = function(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/plain; charset=UTF-8'
    });
    
    res.end('This is host0!');
};
