#!/usr/bin/env node

const glob = require('glob');

const findUnused = require('./lib/find-unused');

let srcFiles = [];
process.argv.slice(2).forEach(arg => {
  srcFiles = srcFiles.concat(glob.sync(arg));
});

function print(type, idents) {
  idents.sort().forEach(ident => console.log(`${type}: ${ident.path} - ${ident.id}`));
}

const { vars, mixins, functions, usedVars, usedMixins } = findUnused(srcFiles);
print('unused variable', vars);
print('unused mixin', mixins);
print('unused functions', functions);
print('used varianble', usedVars);
print('used Mixins', usedMixins);

if (vars.length || mixins.length || functions.length) {
  process.exit(1);
} else {
  process.exit(0);
}
