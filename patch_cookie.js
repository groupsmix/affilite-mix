const fs = require('fs');

const uiPath = '/data/user/work/affilite-mix/app/(public)/components/cookie-consent.tsx';
if (fs.existsSync(uiPath)) {
  let ui = fs.readFileSync(uiPath, 'utf8');
  ui = ui.replace(/nh_csrf/g, '__csrf');
  fs.writeFileSync(uiPath, ui);
}

const privacyPath = '/data/user/work/affilite-mix/app/(public)/privacy/page.tsx';
if (fs.existsSync(privacyPath)) {
  let privacy = fs.readFileSync(privacyPath, 'utf8');
  privacy = privacy.replace(/nh_csrf/g, '__csrf');
  fs.writeFileSync(privacyPath, privacy);
}

