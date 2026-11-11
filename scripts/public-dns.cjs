// Dev-only workaround: some home routers (e.g. JioFiber) refuse DNS queries for *.neon.tech.
// Preload with NODE_OPTIONS="-r ./scripts/public-dns.cjs" to resolve those hosts through public resolvers.
const dns = require("node:dns");
const resolver = new dns.Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);
const original = dns.lookup;
dns.lookup = function lookup(hostname, options, callback) {
  if (typeof options === "function") [callback, options] = [options, {}];
  if (typeof options === "number") options = { family: options };
  if (!/\.neon\.tech$/.test(hostname)) return original.call(dns, hostname, options, callback);
  resolver.resolve4(hostname, (err, addresses) => {
    if (err || !addresses.length) return original.call(dns, hostname, options, callback);
    if (options && options.all) return callback(null, addresses.map((address) => ({ address, family: 4 })));
    callback(null, addresses[0], 4);
  });
};
