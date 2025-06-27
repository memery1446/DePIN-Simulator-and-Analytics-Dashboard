const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
    app.use(
        '/rpc',
        createProxyMiddleware({
            target: 'http://127.0.0.1:56614/ext/bc/VJzNPCCvPagF82S7XzTUjjZDkJCPDXQ18XVAQt65TUtELEQNJ',
            changeOrigin: true,
            pathRewrite: {
                '^/rpc': '', // remove /rpc prefix
            },
        })
    );
};
