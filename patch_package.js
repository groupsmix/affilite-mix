const fs = require('fs');

let pkg = JSON.parse(fs.readFileSync('/data/user/work/affilite-mix/package.json', 'utf8'));

pkg.overrides = pkg.overrides || {};
pkg.overrides["postcss"] = "^8.5.10";
pkg.overrides["tmp"] = "^0.2.5";
pkg.overrides["uuid"] = "^14.0.0";

fs.writeFileSync('/data/user/work/affilite-mix/package.json', JSON.stringify(pkg, null, 2));

